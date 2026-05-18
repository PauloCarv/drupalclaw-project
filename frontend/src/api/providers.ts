/**
 * Provider API — AI provider/model management + OOBE setup.
 *
 * PiClaw routes:
 *   - GET  /agent/models            → available models
 *   - GET  /agent/status            → agent status (idle/running)
 *   - GET  /agent/context           → agent context info
 *   - POST /agent/default/message   → send commands (e.g. /login) — processes them
 *   - POST /agent/card-action       → submit Adaptive Card responses
 *   - POST /agent/oobe/complete     → mark OOBE as done
 */

import { apiGet, apiPost } from './client'

export interface Provider {
  id: string
  name: string
  type: string
  model: string
  active: boolean
  baseUrl?: string
}

export interface ProviderModel {
  id: string
  name: string
  provider: string
}

export async function getProviders(): Promise<Provider[]> {
  try {
    const data = await apiGet<any>('/agent/models')
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.providers)) return data.providers
    if (data && Array.isArray(data.models)) {
      return data.models.map((m: any) => ({
        id: m.id || m.name,
        name: m.name || m.id,
        type: m.provider || 'anthropic',
        model: m.id || m.name,
        active: m.active || false,
      }))
    }
    if (data && (data.model || data.provider)) {
      return [{
        id: data.model || 'default',
        name: data.model || 'default',
        type: data.provider || 'anthropic',
        model: data.model || '',
        active: true,
      }]
    }
    return []
  } catch {
    return []
  }
}

export interface ModelOption {
  label: string      // e.g. "github-copilot/claude-sonnet-4.6" — what to send to /model
  provider: string
  id: string
  name: string       // display name e.g. "Claude Sonnet 4.6"
  contextWindow: number | null
  reasoning: boolean
}

export interface ModelsResponse {
  current: string
  models: string[]
  model_options: ModelOption[]
}

export async function getModels(): Promise<ProviderModel[]> {
  try {
    const data = await apiGet<any>('/agent/models')
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.models)) return data.models
    return []
  } catch {
    return []
  }
}

export async function getModelOptions(): Promise<ModelsResponse> {
  try {
    const data = await apiGet<any>('/agent/models')
    const opts: ModelOption[] = (data?.model_options || []).map((o: any) => ({
      label: o.label,
      provider: o.provider,
      id: o.id,
      name: o.name || o.id,
      contextWindow: o.context_window ?? o.contextWindow ?? null,
      reasoning: Boolean(o.reasoning),
    }))
    return {
      current: data?.current || '',
      models: data?.models || [],
      model_options: opts,
    }
  } catch {
    return { current: '', models: [], model_options: [] }
  }
}

export async function switchModel(label: string): Promise<void> {
  await apiPost('/agent/default/message', { content: `/model ${label}` })
}

// ── OOBE / Setup ──────────────────────────────────────────────

export interface AgentStatus {
  status: string
  oobe?: Record<string, boolean>
  [key: string]: unknown
}

export async function getAgentStatus(): Promise<AgentStatus> {
  try {
    return await apiGet<AgentStatus>('/agent/status')
  } catch {
    return { status: 'unknown' }
  }
}

export async function isProviderReady(): Promise<boolean> {
  try {
    const status = await getAgentStatus()
    if (status.oobe) {
      if (status.oobe.provider_ready_completed_instance === true) return true
      if (status.oobe.provider_ready === true) return true
    }
    const data = (status as any).data
    if (data && data.oobe) {
      if (data.oobe.provider_ready_completed_instance === true) return true
      if (data.oobe.provider_ready === true) return true
    }
    const context = await getAgentContext()
    if (context && context.oobe) {
      if (context.oobe.provider_ready_completed_instance === true) return true
    }
    if (context && context.provider) return true
    if (context && context.model) return true
    const models = await getModels()
    return models.length > 0
  } catch {
    return false
  }
}

export async function getAgentContext(chatJid = 'web:default'): Promise<any> {
  try {
    return await apiGet<any>(`/agent/context?chat_jid=${encodeURIComponent(chatJid)}`)
  } catch {
    return {}
  }
}

export interface SystemMetrics {
  cpu_percent: number
  ram_percent: number
  cpu_series: number[]
  ram_series: number[]
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    return await apiGet<SystemMetrics>('/agent/system-metrics')
  } catch {
    return { cpu_percent: 0, ram_percent: 0, cpu_series: [], ram_series: [] }
  }
}

// ── Agent Message & Card Actions ──────────────────────────────

/**
 * Send a message/command to the agent.
 * This is the correct endpoint — /agent/default/message processes commands like /login.
 * (POST /post only stores to timeline without processing)
 */
export async function sendAgentMessage(content: string): Promise<any> {
  return apiPost('/agent/default/message', { content })
}

/**
 * Submit an Adaptive Card action (form submission).
 * Used for the login card flow steps.
 */
export async function submitCardAction(
  postId: number,
  cardId: string,
  actionData: Record<string, unknown>
): Promise<any> {
  return apiPost('/agent/card-action', {
    post_id: postId,
    card_id: cardId,
    action: {
      type: 'Action.Submit',
      data: actionData,
    },
  })
}

/** Mark OOBE as complete */
export async function completeOobe(): Promise<any> {
  try {
    return apiPost('/agent/oobe/complete', {})
  } catch {
    return {}
  }
}
