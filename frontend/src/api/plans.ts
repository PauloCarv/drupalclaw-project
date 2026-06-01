import { apiGet, apiDelete, apiPut } from './client'
import { runWorkspaceCommand } from './bash'
import { sendAgentMessage } from './providers'

const PLANS_DIR = '.piclaw/plans'
const RUNS_DIR = '/workspace/.piclaw/plans/runs'

export interface PlanMeta {
  id: string
  title: string
  status: 'draft' | 'ready' | 'running' | 'completed' | 'failed'
  source: string  // 'chat' | 'flow:<id>' | 'manual'
  created: string
  updated: string
  runs?: PlanRun[]
}

export interface PlanRun {
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed'
  logPath?: string
}

export interface PlanSummary extends PlanMeta {
  // subset used for list view
}

export interface PlanDetail {
  meta: PlanMeta
  body: string   // markdown body after frontmatter
  raw: string    // full file content
}

function parseFrontmatter(raw: string): { meta: Partial<PlanMeta>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return { meta: {}, body: raw }
  const yamlStr = raw.slice(4, end)
  const body = raw.slice(end + 4).trimStart()
  const meta: Partial<PlanMeta> = {}
  for (const line of yamlStr.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const [, key, val] = m
    if (key === 'id' || key === 'title' || key === 'status' || key === 'source' || key === 'created' || key === 'updated') {
      (meta as any)[key] = val.trim().replace(/^['"]|['"]$/g, '')
    }
    if (key === 'runs') {
      // runs is a YAML array — we skip deep parsing in list view; getPlan handles it
    }
  }
  return { meta, body }
}

function parseRunsFromRaw(raw: string): PlanRun[] {
  const runsMatch = raw.match(/^runs:\n((?:  - [\s\S]*?)(?=\n\w|\n---$|$))/m)
  if (!runsMatch) return []
  const runsBlock = runsMatch[1]
  const runs: PlanRun[] = []
  const entries = runsBlock.split(/\n  - /).filter(Boolean)
  for (const entry of entries) {
    const run: Partial<PlanRun> = {}
    for (const line of entry.split('\n')) {
      const m = line.match(/^\s*(startedAt|completedAt|status|logPath):\s*(.+)$/)
      if (m) (run as any)[m[1]] = m[2].trim()
    }
    if (run.startedAt) runs.push(run as PlanRun)
  }
  return runs
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `plan-${Date.now()}`
}

export async function listPlans(): Promise<PlanSummary[]> {
  try {
    const tree = await apiGet<any>(`/workspace/tree?path=${encodeURIComponent(PLANS_DIR)}`)
    const nodes: any[] = tree?.children ?? tree?.root?.children ?? (Array.isArray(tree) ? tree : [])
    const mdFiles = nodes.filter((n: any) => n.name?.endsWith('.md') && n.type === 'file')

    const plans = await Promise.allSettled(
      mdFiles.map(async (n: any) => {
        const env = await apiGet<{ text: string }>(`/workspace/file?path=${encodeURIComponent(n.path)}`)
        const { meta } = parseFrontmatter(env.text)
        if (!meta.id || !meta.title) return null
        return {
          id: meta.id,
          title: meta.title,
          status: meta.status ?? 'draft',
          source: meta.source ?? 'manual',
          created: meta.created ?? '',
          updated: meta.updated ?? n.mtime ?? '',
        } as PlanSummary
      })
    )

    return plans
      .filter((r): r is PromiseFulfilledResult<PlanSummary | null> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value!)
      .sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created))
  } catch {
    return []
  }
}

export async function getPlan(id: string): Promise<PlanDetail | null> {
  try {
    const env = await apiGet<{ text: string }>(`/workspace/file?path=${encodeURIComponent(`${PLANS_DIR}/${id}.md`)}`)
    const raw = env.text
    const { meta, body } = parseFrontmatter(raw)
    const runs = parseRunsFromRaw(raw)
    return {
      meta: {
        id: meta.id ?? id,
        title: meta.title ?? id,
        status: meta.status ?? 'draft',
        source: meta.source ?? 'manual',
        created: meta.created ?? '',
        updated: meta.updated ?? '',
        runs,
      },
      body,
      raw,
    }
  } catch {
    return null
  }
}

function buildPlanMarkdown(opts: {
  id: string
  title: string
  source: string
  context: string
  steps: string[]
  verification: string[]
}): string {
  const now = new Date().toISOString()
  const fm = [
    '---',
    `id: ${opts.id}`,
    `title: "${opts.title.replace(/"/g, '\\"')}"`,
    'status: draft',
    `source: ${opts.source}`,
    `created: ${now}`,
    `updated: ${now}`,
    'runs: []',
    '---',
  ].join('\n')

  const stepLines = opts.steps.length
    ? opts.steps.map((s) => `- [ ] ${s.replace(/^[-*]\s*\[[ x]\]\s*/i, '').replace(/^[-*]\s*/, '')}`).join('\n')
    : '- [ ] (add steps here)'

  const verLines = opts.verification.length
    ? opts.verification.map((v) => `- [ ] ${v.replace(/^[-*]\s*\[[ x]\]\s*/i, '').replace(/^[-*]\s*/, '')}`).join('\n')
    : '- [ ] (add verification steps here)'

  const contextSection = opts.context.trim()
    ? `## Context\n\n${opts.context.trim()}`
    : '## Context\n\n(Describe what this plan does and why.)'

  return `${fm}\n\n${contextSection}\n\n## Steps\n\n${stepLines}\n\n## Verification\n\n${verLines}\n`
}

export async function createPlan(opts: {
  title: string
  source: string
  context?: string
  steps?: string[]
  verification?: string[]
}): Promise<string> {
  const id = slugify(opts.title)
  const md = buildPlanMarkdown({
    id,
    title: opts.title,
    source: opts.source,
    context: opts.context ?? '',
    steps: opts.steps ?? [],
    verification: opts.verification ?? [],
  })
  const b64 = btoa(unescape(encodeURIComponent(md)))
  const key = `piclaw_plans_write_${Date.now().toString(36)}`
  await runWorkspaceCommand(
    `mkdir -p /workspace/.piclaw/plans/runs && printf '%s' '${b64}' | base64 -d > /workspace/.piclaw/plans/${id}.md`,
    20000,
    key,
  )
  return id
}

export async function savePlan(id: string, raw: string): Promise<void> {
  await apiPut('/workspace/file', { path: `${PLANS_DIR}/${id}.md`, content: raw })
}

export async function deletePlan(id: string): Promise<void> {
  await apiDelete(`/workspace/file?path=${encodeURIComponent(`${PLANS_DIR}/${id}.md`)}`)
}

export async function executePlan(id: string): Promise<void> {
  await sendAgentMessage(`/skill:drupal-plan-run ${id}`)
}

export async function validatePlan(id: string): Promise<void> {
  await sendAgentMessage(`/skill:drupal-plan-validate ${id}`)
}

export async function getPlanRuns(id: string): Promise<{ filename: string; timestamp: number }[]> {
  try {
    const env = await apiGet<any>(`/workspace/tree?path=${encodeURIComponent(`${PLANS_DIR}/runs`)}`)
    const nodes: any[] = env?.children ?? env?.root?.children ?? (Array.isArray(env) ? env : [])
    return nodes
      .filter((n: any) => n.name?.startsWith(`${id}-`) && n.name?.endsWith('.log'))
      .map((n: any) => ({
        filename: n.name,
        timestamp: n.mtime ? new Date(n.mtime).getTime() : 0,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

export { RUNS_DIR }
