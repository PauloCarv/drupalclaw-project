import { apiGet } from './client'
import { runWorkspaceCommand } from './bash'

const RUNS_CLIENT_KEY   = 'piclaw_flows_runs_client'
const STATUS_CLIENT_KEY = 'piclaw_flows_status_client'
const RESULT_CLIENT_KEY = 'piclaw_fs_result_client'

export interface FlowStep {
  id: string
  type: 'skill' | 'message' | 'mcp'
  command?: string   // "/skill:drupal-cr"
  label?: string     // display name for skill or mcp server name
  mcpServer?: string // mcp server key from mcp.json (e.g. 'jira', 'github')
  content?: string   // message text or mcp instruction, may contain {{param}} placeholders
}

export interface FlowParam {
  key: string
  label: string
  default?: string
}

export interface FlowSchedule {
  scheduleType: 'interval' | 'cron'
  intervalMinutes?: number    // for interval type
  cronExpression?: string     // for cron type, always in UTC
  timezone?: string           // IANA timezone used when creating (for display)
  label: string               // human-readable display
}

export interface Flow {
  id: string
  name: string
  description?: string
  trigger: 'manual' | 'schedule'
  schedule?: FlowSchedule
  params: FlowParam[]
  steps: FlowStep[]
  createdAt: number
  lastRunAt?: number
}

const FLOWS_PATH = '.piclaw/flows.json'
const IPC_TASKS_DIR = '/workspace/.piclaw/data/ipc/tasks'
const DB_PATH = '/workspace/.piclaw/store/messages.db'
const TMP_DIR = '/workspace/.piclaw/tmp'
const FLOWS_JID = 'web:drupalclaw-flows'

export interface FlowRun {
  id: number
  runAt: string
  status: string
  durationMs: number
  result: string | null  // null until expanded
  error: string | null
  scheduleType: 'once' | 'cron' | 'interval'
}

async function readFlowsFile(): Promise<Flow[]> {
  try {
    const envelope = await apiGet<{ text: string; truncated?: boolean }>(
      `/workspace/file?path=${encodeURIComponent(FLOWS_PATH)}`
    )
    return JSON.parse(envelope.text) as Flow[]
  } catch {
    return []
  }
}

async function writeFlowsFile(flows: Flow[]): Promise<void> {
  const content = JSON.stringify(flows)
  const b64 = btoa(unescape(encodeURIComponent(content)))
  // Fresh key per call — avoids inheriting stale PTY state from previous (possibly timed-out) sessions
  const key = `piclaw_flows_write_${Date.now().toString(36)}`
  await runWorkspaceCommand(
    `mkdir -p /workspace/.piclaw && printf '%s' '${b64}' | base64 -d > /workspace/.piclaw/flows.json`,
    20000,
    key,
  )
}

async function writeIpcFile(data: object, prefix: string): Promise<void> {
  const filename = `${prefix}_${Date.now()}.json`
  const content = JSON.stringify(data)
  const b64 = btoa(unescape(encodeURIComponent(content)))
  const key = `piclaw_ipc_write_${Date.now().toString(36)}`
  await runWorkspaceCommand(
    `mkdir -p ${IPC_TASKS_DIR} && printf '%s' '${b64}' | base64 -d > ${IPC_TASKS_DIR}/${filename}`,
    20000,
    key,
  )
}

// Marker embedded in the prompt so we can find the task by flow ID
function flowMarker(flowId: string): string {
  return `[drupalclaw-flow:${flowId}]`
}

function buildFlowPrompt(flow: Flow): string {
  const steps = flow.steps.map((s, i) => {
    if (s.type === 'skill') return `Step ${i + 1} (skill): ${s.command}`
    if (s.type === 'mcp') return `Step ${i + 1} (MCP ${s.mcpServer ?? ''}): ${s.content}`
    return `Step ${i + 1} (mensagem): ${s.content}`
  }).join('\n')
  return `${flowMarker(flow.id)}\nExecuta o flow "${flow.name}" com os seguintes steps sequencialmente:\n\n${steps}\n\nExecuta cada step por ordem. Se um step falhar, reporta o erro e continua.`
}

export async function registerFlowSchedule(flow: Flow): Promise<void> {
  if (!flow.schedule) return
  // Cancel any existing task for this flow first
  await cancelFlowSchedule(flow.id)

  const { scheduleType, intervalMinutes, cronExpression } = flow.schedule
  const scheduleValue = scheduleType === 'cron'
    ? cronExpression!
    : String((intervalMinutes ?? 60) * 60 * 1000)

  await writeIpcFile({
    type: 'schedule_task',
    schedule_type: scheduleType,
    schedule_value: scheduleValue,
    prompt: buildFlowPrompt(flow),
    task_kind: 'agent',
    chat_jid: FLOWS_JID,
  }, `flow_${flow.id}`)
}

export async function cancelFlowSchedule(flowId: string): Promise<void> {
  const marker = flowMarker(flowId).replace(/'/g, "''")
  // Query SQLite for the active task, then write a cancel IPC file
  await runWorkspaceCommand(
    `TASK_ID=$(sqlite3 "${DB_PATH}" "SELECT id FROM scheduled_tasks WHERE prompt LIKE '%${marker}%' AND status='active' LIMIT 1" 2>/dev/null); ` +
    `if [ -n "$TASK_ID" ]; then echo '{"type":"cancel_task","taskId":"'$TASK_ID'"}' > ${IPC_TASKS_DIR}/cancel_${flowId}_$(date +%s).json; fi`
  )
}

export async function loadFlows(): Promise<Flow[]> {
  return readFlowsFile()
}

export async function saveFlow(flow: Flow): Promise<void> {
  const flows = await readFlowsFile()
  const idx = flows.findIndex((f) => f.id === flow.id)
  if (idx >= 0) flows[idx] = flow
  else flows.push(flow)
  await writeFlowsFile(flows)
}

export async function deleteFlow(id: string): Promise<void> {
  const flows = await readFlowsFile()
  await writeFlowsFile(flows.filter((f) => f.id !== id))
}

export async function markFlowRun(id: string): Promise<void> {
  const flows = await readFlowsFile()
  const idx = flows.findIndex((f) => f.id === id)
  if (idx >= 0) {
    flows[idx] = { ...flows[idx], lastRunAt: Date.now() }
    await writeFlowsFile(flows)
  }
}

export async function isFlowRunning(flowId: string): Promise<boolean> {
  const marker = flowMarker(flowId).replace(/'/g, "''")
  const tmpPath = `.piclaw/tmp/running-${flowId}.json`
  await runWorkspaceCommand(
    `mkdir -p ${TMP_DIR} && sqlite3 -json "${DB_PATH}" ` +
    `"SELECT id FROM scheduled_tasks WHERE prompt LIKE '%${marker}%' AND status='running' LIMIT 1" ` +
    `> /workspace/${tmpPath} 2>/dev/null || echo '[]' > /workspace/${tmpPath}; chmod 644 /workspace/${tmpPath} 2>/dev/null`,
    15000,
    STATUS_CLIENT_KEY,
  )
  try {
    const envelope = await apiGet<{ text: string }>(`/workspace/file?path=${encodeURIComponent(tmpPath)}`)
    const rows = JSON.parse(envelope.text || '[]')
    return Array.isArray(rows) && rows.length > 0
  } catch { return false }
}

export async function triggerManualRun(flow: Flow, params: Record<string, string>): Promise<void> {
  const steps = flow.steps.map((s, i) => {
    if (s.type === 'skill') return `${i + 1}. Skill: ${s.command}`
    if (s.type === 'mcp') return `${i + 1}. MCP ${s.mcpServer ?? ''}: ${interpolateParams(s.content ?? '', params)}`
    return `${i + 1}. Instruction: ${interpolateParams(s.content ?? '', params)}`
  }).join('\n')
  const prompt = `${flowMarker(flow.id)}\nRun the flow "${flow.name}" sequentially:\n\n${steps}\n\nExecute each item in order. Report the result of each step.`
  // Schedule 5 seconds from now so PiClaw picks it up immediately
  const scheduleValue = new Date(Date.now() + 5000).toISOString()
  await writeIpcFile({
    type: 'schedule_task',
    schedule_type: 'once',
    schedule_value: scheduleValue,
    prompt,
    task_kind: 'agent',
    chat_jid: FLOWS_JID,
  }, `run_${flow.id}`)
}

export async function getFlowRuns(flowId: string): Promise<FlowRun[]> {
  const marker = flowMarker(flowId).replace(/'/g, "''")
  // Fixed filename — no timestamp — avoids accumulating hundreds of root-owned files in tmp/
  // Includes result column directly (avg ~1.5KB/run × LIMIT 5 = ~8KB, within API limits)
  const tmpPath = `.piclaw/tmp/runs-${flowId}.json`
  await runWorkspaceCommand(
    `mkdir -p ${TMP_DIR} && sqlite3 -json "${DB_PATH}" ` +
    `"SELECT trl.id, trl.run_at as runAt, trl.status, trl.duration_ms as durationMs, ` +
    `trl.error, trl.result, st.schedule_type as scheduleType ` +
    `FROM task_run_logs trl JOIN scheduled_tasks st ON trl.task_id = st.id ` +
    `WHERE st.prompt LIKE '%${marker}%' ORDER BY trl.run_at DESC LIMIT 5" ` +
    `> /workspace/${tmpPath} 2>/dev/null || echo '[]' > /workspace/${tmpPath}; chmod 644 /workspace/${tmpPath} 2>/dev/null`,
    20000,
    RUNS_CLIENT_KEY,
  )
  try {
    const envelope = await apiGet<{ text: string }>(`/workspace/file?path=${encodeURIComponent(tmpPath)}`)
    const parsed = JSON.parse(envelope.text || '[]')
    return Array.isArray(parsed) ? parsed as FlowRun[] : []
  } catch {
    return []
  }
}

export async function getRunResult(runId: number): Promise<string | null> {
  // Uses a dedicated PTY key so it never conflicts with the getFlowRuns poll session
  const tmpPath = `.piclaw/tmp/run-result-${runId}.json`
  try {
    await runWorkspaceCommand(
      `mkdir -p ${TMP_DIR} && sqlite3 -json "${DB_PATH}" ` +
      `"SELECT result FROM task_run_logs WHERE id=${runId} LIMIT 1" ` +
      `> /workspace/${tmpPath} 2>/dev/null || echo '[]' > /workspace/${tmpPath}; chmod 644 /workspace/${tmpPath} 2>/dev/null`,
      20000,
      RESULT_CLIENT_KEY,
    )
  } catch {
    return null
  }
  try {
    const envelope = await apiGet<{ text: string; truncated?: boolean }>(
      `/workspace/file?path=${encodeURIComponent(tmpPath)}`
    )
    const rows = JSON.parse(envelope.text || '[]')
    return Array.isArray(rows) && rows.length > 0 ? (rows[0].result ?? null) : null
  } catch { return null }
}

export function interpolateParams(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`)
}
