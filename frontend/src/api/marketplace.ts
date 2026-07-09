import { apiGet, apiPut } from './client'
import { loadMcpConfig, addMcpServer, type McpCatalogEntry } from './mcp'
import { runWorkspaceCommand } from './bash'

export interface MarketplaceSkillEntry {
  name: string
  description: string
  url: string
  format: 'skill.md' | 'copilot' | 'openai' | 'sdlc-plugin'
}

export interface MarketplaceMcpEntry {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  envKeys?: { key: string; label: string; secret?: boolean }[]
}

export interface MarketplaceManifest {
  name: string
  slug: string
  version?: string
  description?: string
  auth: 'none' | 'token' | 'github-pat'
  skills: MarketplaceSkillEntry[]
  mcpServers: MarketplaceMcpEntry[]
}

export interface InstalledMarketplace {
  slug: string
  name: string
  url: string
  installedAt: string
  skills: string[]  // base names (without slug prefix), e.g. ['accessibility', 'jira-check']
}

export interface MarketplaceRegistry {
  marketplaces: InstalledMarketplace[]
}

const REGISTRY_PATH = '.pi/marketplace-registry.json'
const SKILLS_BASE = '.pi/skills'

export async function loadMarketplaceRegistry(): Promise<MarketplaceRegistry> {
  try {
    const envelope = await apiGet<{ text: string }>(
      `/workspace/file?path=${encodeURIComponent(REGISTRY_PATH)}`
    )
    return JSON.parse(envelope.text) as MarketplaceRegistry
  } catch {
    return { marketplaces: [] }
  }
}

async function saveMarketplaceRegistry(registry: MarketplaceRegistry): Promise<void> {
  const content = JSON.stringify(registry, null, 2)
  try {
    await apiPut('/workspace/file', { path: REGISTRY_PATH, content })
  } catch {
    // PiClaw requires the file to pre-exist for PUT — fall back to shell write.
    const b64 = btoa(unescape(encodeURIComponent(content)))
    await runWorkspaceCommand(
      `mkdir -p /workspace/.pi && printf '%s' '${b64}' | base64 -d > /workspace/${REGISTRY_PATH}`
    )
  }
}

// Server-side fetch via PTY curl — avoids CORS and shell injection.
// Token is base64-encoded so it never appears raw in the shell command.
// jqFilter (optional) is piped through jq to slim the response before writing —
// required for large GitHub API responses that would exceed PiClaw's 20KB text truncation limit.
async function serverSideFetch(url: string, token?: string, jqFilter?: string): Promise<unknown> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const outPath = `.pi/tmp/mktplace-out-${id}.json`
  const wsOutPath = `/workspace/${outPath}`

  const curlBase = token
    ? (() => {
        const b64Token = btoa(token)
        return `_TOK=$(printf '%s' '${b64Token}' | base64 -d) && curl -sL -H "Authorization: token $_TOK" -H "Accept: application/vnd.github.v3+json"`
      })()
    : `curl -sL -H "Accept: application/vnd.github.v3+json"`

  const setupAndFetch = jqFilter
    ? `mkdir -p /workspace/.pi/tmp && ${curlBase} "${url}" | jq '${jqFilter}' > "${wsOutPath}"`
    : `mkdir -p /workspace/.pi/tmp && ${curlBase} -o "${wsOutPath}" "${url}"`

  try {
    await runWorkspaceCommand(setupAndFetch, 30000)
  } catch (e) {
    throw new Error(`Fetch via container failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  let text: string
  try {
    const envelope = await apiGet<{ text: string }>(`/workspace/file?path=${encodeURIComponent(outPath)}`)
    text = envelope.text
  } catch {
    throw new Error(`Could not read result — curl may have failed or timed out.`)
  } finally {
    runWorkspaceCommand(`rm -f "${wsOutPath}"`).catch(() => {})
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON from GitHub API`)
  }

  // Propagate GitHub API errors (404, 401, etc.)
  if (parsed && typeof parsed === 'object' && 'message' in parsed) {
    const ghMsg = (parsed as { message: string }).message
    throw new Error(`GitHub: ${ghMsg}`)
  }

  return parsed
}

async function githubApiFetch(url: string, token?: string, jqFilter?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (token) headers['Authorization'] = `token ${token}`

  let res: Response
  try {
    res = await fetch(url, { headers })
  } catch {
    // CORS or network block — fall back to server-side curl
    return serverSideFetch(url, token, jqFilter)
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (body as { message?: string })?.message ?? `HTTP ${res.status}`
    throw new Error(`GitHub: ${msg}`)
  }
  return body
}

function parseSdlcPluginsUrl(url: string): { owner: string; repo: string } | null {
  // Match https://github.com/<owner>/<repo> or https://github.com/<owner>/<repo>.git
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

async function fetchSdlcPluginsManifest(owner: string, repo: string, token?: string): Promise<MarketplaceManifest> {
  const slug = repo.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`

  // Slim the directory listing to only name+type — the full response can exceed PiClaw's 20KB limit.
  // The filter passes error objects (non-array) through unchanged so API errors still propagate.
  const entries = await githubApiFetch(
    `${apiBase}/contents/plugins`,
    token,
    'if type == "array" then [.[] | {name, type}] else . end'
  ) as { name: string; type: string }[]
  const pluginDirs = entries.filter((e) => e.type === 'dir')

  const skills: MarketplaceSkillEntry[] = []

  for (const dir of pluginDirs) {
    try {
      // Keep only content+encoding — the other metadata fields inflate the file.
      // Non-object responses (errors) pass through unchanged.
      const pjData = await githubApiFetch(
        `${apiBase}/contents/plugins/${dir.name}/plugin.json`,
        token,
        'if has("content") then {content, encoding} else . end'
      ) as { content?: string }
      if (pjData.content) {
        const pluginJson = JSON.parse(atob(pjData.content.replace(/[\r\n]/g, '')))
        const rawSkills: unknown[] = Array.isArray(pluginJson.skills) ? pluginJson.skills : []
        let added = 0
        for (const entry of rawSkills) {
          if (typeof entry !== 'string') continue
          const normalized = entry.replace(/\/+$/, '')
          // Single-segment entries (e.g. "skills") name a subfolder, not the skill itself.
          // Use the plugin dir name so the skill is called "sdlc-plugins-drupal-module", not "sdlc-plugins-skills".
          const skillName = normalized.includes('/')
            ? normalized.split('/').filter(Boolean).pop() || dir.name
            : dir.name
          skills.push({
            name: skillName,
            description: pluginJson.description ?? dir.name,
            url: `https://raw.githubusercontent.com/${owner}/${repo}/main/plugins/${dir.name}/${normalized}/SKILL.md`,
            format: 'skill.md',
          })
          added++
        }
        if (added > 0) continue  // only skip fallback if we actually extracted skills
      }
    } catch {
      // no plugin.json or parse error — fall through to fallback
    }
    skills.push({
      name: dir.name,
      description: `Plugin from ${repo}`,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/main/plugins/${dir.name}/SKILL.md`,
      format: 'skill.md',
    })
  }

  return {
    name: `${owner}/${repo}`,
    slug,
    version: '1.0',
    description: `sdlc-plugins from github.com/${owner}/${repo}`,
    auth: token ? 'github-pat' : 'none',
    skills,
    mcpServers: [],
  }
}

export async function fetchMarketplaceManifest(url: string, token?: string): Promise<MarketplaceManifest> {
  // Detect GitHub repos
  const ghMatch = parseSdlcPluginsUrl(url)
  if (ghMatch) {
    return fetchSdlcPluginsManifest(ghMatch.owner, ghMatch.repo, token)
  }

  // Try drupalclaw-style manifest at known paths
  const candidates = [
    `${url.replace(/\/$/, '')}/drupalclaw-marketplace.json`,
    `${url.replace(/\/$/, '')}/marketplace.json`,
    `${url.replace(/\/$/, '')}/.drupalclaw/marketplace.json`,
  ]

  for (const candidateUrl of candidates) {
    try {
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `token ${token}`
      const res = await fetch(candidateUrl, { headers })
      if (!res.ok) continue
      const data: MarketplaceManifest = await res.json()
      if (data && (data.skills || data.mcpServers)) return data
    } catch {
      // try next
    }
  }

  throw new Error(`No valid marketplace manifest found at ${url}`)
}

export async function installMarketplaceSkill(
  skill: MarketplaceSkillEntry,
  slug: string,
  token?: string
): Promise<void> {
  const skillName = `${slug}-${skill.name}`
  const destDir = `/workspace/${SKILLS_BASE}/${skillName}`
  const destFile = `${destDir}/SKILL.md`

  if (skill.format === 'skill.md') {
    // Download directly into the workspace via container curl — avoids browser CSP and supports private repos.
    // sed replaces the name: line in frontmatter; exits 0 even when there's no match.
    const curlPart = token
      ? (() => {
          const b64Token = btoa(token)
          return `_TOK=$(printf '%s' '${b64Token}' | base64 -d) && curl -sL -H "Authorization: token $_TOK" -o "${destFile}" "${skill.url}"`
        })()
      : `curl -sL -o "${destFile}" "${skill.url}"`

    const cmd = `mkdir -p "${destDir}" && ${curlPart} && sed -i 's|^name:.*|name: ${skillName}|' "${destFile}"`
    await runWorkspaceCommand(cmd, 30000)
    return
  }

  // copilot / openai formats need JS-side content construction.
  let content: string

  if (skill.format === 'copilot') {
    const res = await fetch(skill.url)
    if (!res.ok) throw new Error(`Failed to fetch Copilot instructions from ${skill.url}`)
    const instructions = await res.text()
    content = `---\nname: ${skillName}\ndescription: ${skill.description}\ndistribution: public\n---\n\n# ${skill.name}\n\n${instructions}\n`
  } else if (skill.format === 'openai') {
    const res = await fetch(skill.url)
    if (!res.ok) throw new Error(`Failed to fetch OpenAI assistant from ${skill.url}`)
    const assistant = await res.json() as { instructions?: string; system_prompt?: string; name?: string }
    const instructions = assistant.instructions ?? assistant.system_prompt ?? ''
    const name = assistant.name ?? skill.name
    content = `---\nname: ${skillName}\ndescription: ${name} (converted from OpenAI format)\ndistribution: public\n---\n\n# ${name}\n\n${instructions}\n`
  } else {
    throw new Error(`Unsupported format: ${skill.format}`)
  }

  await apiPut('/workspace/file', { path: `${SKILLS_BASE}/${skillName}/SKILL.md`, content })
}

export async function installMarketplaceMcp(server: MarketplaceMcpEntry): Promise<void> {
  await addMcpServer(server.id, {
    command: server.command,
    args: server.args,
  })
}

export async function registerMarketplace(
  manifest: MarketplaceManifest,
  url: string,
  newSkill?: string
): Promise<void> {
  const registry = await loadMarketplaceRegistry()
  const existing = registry.marketplaces.find((m) => m.slug === manifest.slug)
  const skills = [...(existing?.skills ?? [])]
  if (newSkill && !skills.includes(newSkill)) skills.push(newSkill)
  const entry: InstalledMarketplace = {
    slug: manifest.slug,
    name: manifest.name,
    url,
    installedAt: existing?.installedAt ?? new Date().toISOString(),
    skills,
  }
  const filtered = registry.marketplaces.filter((m) => m.slug !== manifest.slug)
  await saveMarketplaceRegistry({ marketplaces: [...filtered, entry] })
}

export async function removeMarketplace(slug: string): Promise<void> {
  const registry = await loadMarketplaceRegistry()
  const filtered = registry.marketplaces.filter((m) => m.slug !== slug)
  await saveMarketplaceRegistry({ marketplaces: filtered })
  // Note: skill files under .pi/skills/<slug>-* must be removed server-side
  // The agent skill handles this; from the UI we only clean up the registry
}

export function manifestToMcpCatalogEntry(
  server: MarketplaceMcpEntry,
  slug: string
): McpCatalogEntry {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    category: 'dev',
    command: server.command,
    args: server.args,
    envKeys: server.envKeys ?? [],
    marketplace: slug,
  }
}

/** Load mcp.json and return the set of installed server IDs */
export async function getInstalledMcpIds(): Promise<Set<string>> {
  const config = await loadMcpConfig()
  return new Set(Object.keys(config.mcpServers))
}
