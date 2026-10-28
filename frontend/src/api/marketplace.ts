import { apiGet, apiPut } from './client'
import { loadMcpConfig, addMcpServer, type McpCatalogEntry } from './mcp'
import { runWorkspaceCommand } from './bash'

export interface MarketplaceSkillEntry {
  name: string
  description: string
  url: string
  format: 'skill.md' | 'copilot' | 'openai' | 'sdlc-plugin'
  // Set for skills found by scanning a GitHub repo: the whole folder is installed, not just SKILL.md.
  source?: { owner: string; repo: string; branch: string; dir: string; files: string[] }
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

interface GithubRepoRef {
  owner: string
  repo: string
  branch?: string
  subdir?: string
}

// Values below end up inside shell commands, so only plain path characters are accepted.
const SAFE_REF = /^[A-Za-z0-9._-]+$/
const SAFE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/

function parseGithubUrl(url: string): GithubRepoRef | null {
  // https://github.com/<owner>/<repo>[.git][/tree/<branch>[/<subdir>]]
  const m = url.trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/)
  if (!m) return null
  const [, owner, repo, branch, subdir] = m
  if (!SAFE_REF.test(owner) || !SAFE_REF.test(repo)) return null
  if (branch && !SAFE_REF.test(branch)) return null
  if (subdir && !SAFE_PATH.test(subdir)) return null
  return { owner, repo, branch, subdir }
}

async function fetchSdlcPluginsManifest(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<MarketplaceManifest> {
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
            url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/plugins/${dir.name}/${normalized}/SKILL.md`,
            format: 'skill.md',
          })
        }
      }
    } catch {
      // no plugin.json or parse error — the generic SKILL.md scan covers such plugins
    }
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

// Works for any repo that ships SKILL.md folders, wherever they live (skills/, plugins/*/skills/,
// .claude/skills/, repo root...). The git tree is slimmed with jq (SKILL.md files and their folders only)
// so it stays under PiClaw's 20KB limit. File lists are kept so installs only hit raw.githubusercontent.com,
// which, unlike api.github.com, has no tight anonymous rate limit.
async function fetchGithubSkillsManifest(
  owner: string,
  repo: string,
  branch: string,
  subdir: string | undefined,
  tree: GithubTree,
  token?: string,
): Promise<MarketplaceManifest> {
  const slug = repo.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const allPaths = (tree.tree ?? []).map((e) => e.path)
  const prefix = subdir ? `${subdir}/` : ''
  const found = (tree.tree ?? [])
    .map((e) => e.path)
    .filter((p) => (p === 'SKILL.md' || p.endsWith('/SKILL.md')) && (!prefix || p.startsWith(prefix)))
    .map((file) => {
      const dir = file === 'SKILL.md' ? '' : file.slice(0, -'/SKILL.md'.length)
      return { file, dir, name: (dir.split('/').pop() || repo).toLowerCase() }
    })
    .filter((e) => e.dir === '' || SAFE_PATH.test(e.dir))
  // A root SKILL.md only counts when it is the repo's single skill; otherwise it describes the repo itself.
  // Skills nested inside another skill's folder are resources of that skill, not skills.
  const entries = found.filter((e) =>
    (e.dir !== '' || found.length === 1) && !found.some((o) => o.dir !== '' && e.dir.startsWith(`${o.dir}/`)))

  // Two skills with the same folder name (e.g. under different plugins) get their parent folder as prefix.
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)

  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`
  const skills: MarketplaceSkillEntry[] = await Promise.all(entries.map(async (e) => {
    const parts = e.dir.split('/')
    const name = (counts.get(e.name)! > 1 && parts.length > 1 ? `${parts[parts.length - 2]}-${e.name}` : e.name)
      .replace(/[^a-z0-9-]/g, '-')
    return {
      name,
      description: await readSkillDescription(`${rawBase}/${e.file}`, token) ?? `Skill from ${owner}/${repo}`,
      url: `${rawBase}/${e.file}`,
      format: 'skill.md' as const,
      // A SKILL.md at the repo root has no folder of its own to copy.
      source: e.dir
        ? { owner, repo, branch, dir: e.dir, files: allPaths.filter((p) => p.startsWith(`${e.dir}/`)).map((p) => p.slice(e.dir.length + 1)) }
        : undefined,
    }
  }))

  if (skills.length === 0) {
    throw new Error(`No SKILL.md found in ${owner}/${repo}${subdir ? `/${subdir}` : ''} (branch ${branch})`)
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))

  return {
    name: `${owner}/${repo}`,
    slug,
    version: '1.0',
    description: `Skills from github.com/${owner}/${repo}`,
    auth: token ? 'github-pat' : 'none',
    skills,
    mcpServers: [],
  }
}

// Best effort: the description is only a label in the list, so any failure (CORS, private repo) is ignored.
async function readSkillDescription(rawUrl: string, token?: string): Promise<string | null> {
  try {
    const res = await fetch(rawUrl, token ? { headers: { Authorization: `token ${token}` } } : undefined)
    if (!res.ok) return null
    const head = (await res.text()).split(/\r?\n/).slice(0, 40)
    if (head[0]?.trim() !== '---') return null
    const end = head.indexOf('---', 1)
    const fm = head.slice(1, end === -1 ? undefined : end)
    const idx = fm.findIndex((l) => /^description:/.test(l))
    if (idx === -1) return null
    let value = fm[idx].replace(/^description:\s*/, '')
    // Folded/literal block scalars: description is on the following indented lines.
    if (/^[>|][+-]?$/.test(value.trim()) || value.trim() === '') {
      const lines: string[] = []
      for (const l of fm.slice(idx + 1)) {
        if (!/^\s+\S/.test(l)) break
        lines.push(l.trim())
      }
      value = lines.join(' ')
    }
    value = value.trim().replace(/^(["'])(.*)\1$/, '$2')
    return value ? (value.length > 200 ? `${value.slice(0, 197)}...` : value) : null
  } catch {
    return null
  }
}

type GithubTree = { tree?: { path: string; type?: string }[] }

// One API request per repo: 'HEAD' resolves the default branch server-side, so no extra lookup is needed.
// plugin.json paths are kept only to detect the sdlc-plugins layout.
const TREE_JQ = 'if has("tree") then ([.tree[] | select(.type == "blob") | .path]) as $p | ($p | map(select(endswith("/SKILL.md")) | sub("SKILL.md$"; ""))) as $d | {tree: [$p[] | select(. as $x | $x == "SKILL.md" or ($x | startswith("plugins/") and endswith("/plugin.json")) or any($d[]; . as $dd | $x | startswith($dd))) | {path: .}]} else . end'

async function fetchGithubManifest(ref: GithubRepoRef, token?: string): Promise<MarketplaceManifest> {
  const { owner, repo } = ref
  const branch = ref.branch ?? 'HEAD'
  const tree = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token,
    TREE_JQ,
  ) as GithubTree

  // sdlc-plugins layout (plugins/<name>/plugin.json) keeps its own handling; anything else is scanned for SKILL.md.
  const isSdlcLayout = (tree.tree ?? []).some((e) => /^plugins\/[^/]+\/plugin\.json$/.test(e.path))
  if (isSdlcLayout && !ref.subdir) {
    try {
      const sdlc = await fetchSdlcPluginsManifest(owner, repo, branch, token)
      if (sdlc.skills.length > 0) return sdlc
    } catch {
      // unreadable plugin metadata — use the generic scan
    }
  }
  return fetchGithubSkillsManifest(owner, repo, branch, ref.subdir, tree, token)
}

export async function fetchMarketplaceManifest(url: string, token?: string): Promise<MarketplaceManifest> {
  const ghMatch = parseGithubUrl(url)
  if (ghMatch) {
    return fetchGithubManifest(ghMatch, token)
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
  const skillName = `${slug}-${skill.name}`.replace(/[^a-zA-Z0-9._-]/g, '-')
  const destDir = `/workspace/${SKILLS_BASE}/${skillName}`
  const destFile = `${destDir}/SKILL.md`

  if (skill.format === 'skill.md') {
    // Download directly into the workspace via container curl — avoids browser CSP and supports private repos.
    // sed replaces the name: line in frontmatter; exits 0 even when there's no match.
    const auth = token ? '-H "Authorization: token $_TOK" ' : ''
    const tokenSetup = token ? `_TOK=$(printf '%s' '${btoa(token)}' | base64 -d) && ` : ''
    const rename = `sed -i 's|^name:.*|name: ${skillName}|' "${destFile}"`

    if (skill.source) {
      // Copy the whole skill folder (scripts, references) from the file list captured at fetch time.
      const { owner, repo, branch, dir, files } = skill.source
      if (![owner, repo, branch].every((v) => SAFE_REF.test(v)) || !SAFE_PATH.test(dir)) {
        throw new Error(`Unsafe skill location: ${owner}/${repo}/${dir}`)
      }
      const safeFiles = files.filter((f) => SAFE_PATH.test(f))
      if (!safeFiles.includes('SKILL.md')) throw new Error(`SKILL.md missing in ${owner}/${repo}/${dir}`)
      const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dir}`
      const dirs = [...new Set(safeFiles.map((f) => f.split('/').slice(0, -1).join('/')))].map((d) => `"${destDir}/${d}"`)
      const fetches = safeFiles.map((f) => `curl -sfL ${auth}-o "${destDir}/${f}" "${rawBase}/${f}"`)
      // The PTY drops shell lines longer than ~4KB, so the downloads are sent in several short commands.
      const chunks: string[][] = [[]]
      let size = 0
      for (const f of fetches) {
        if (size + f.length > 2500) { chunks.push([]); size = 0 }
        chunks[chunks.length - 1].push(f)
        size += f.length + 4
      }
      await runWorkspaceCommand(`mkdir -p ${dirs.join(' ')}`, 30000)
      for (const chunk of chunks) {
        await runWorkspaceCommand(`${tokenSetup}${chunk.join(' && ')}`, 90000)
      }
      await runWorkspaceCommand(`test -s "${destFile}" && ${rename}`, 30000)
      return
    }

    const cmd = `${tokenSetup}mkdir -p "${destDir}" && curl -sL ${auth}-o "${destFile}" "${skill.url}" && ${rename}`
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
  const target = registry.marketplaces.find((m) => m.slug === slug)
  // Only folders recorded at install time are deleted, named the same way installMarketplaceSkill creates them.
  const dirs = (target?.skills ?? [])
    .map((name) => `${slug}-${name}`.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .filter((n) => SAFE_REF.test(n))
    .map((n) => `"/workspace/${SKILLS_BASE}/${n}"`)
  if (dirs.length > 0) await runWorkspaceCommand(`rm -rf ${dirs.join(' ')}`, 30000)
  const filtered = registry.marketplaces.filter((m) => m.slug !== slug)
  await saveMarketplaceRegistry({ marketplaces: filtered })
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
