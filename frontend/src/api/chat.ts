/**
 * Chat API — communicates with PiClaw chat engine.
 *
 * PiClaw uses a micro-blog/timeline model:
 *   - GET  /timeline?limit=N              → recent messages (posts)
 *   - POST /agent/default/message         → send a message / command (triggers agent run)
 *   - GET  /agent/session-tree            → session/chat tree
 *   - GET  /sse/stream                    → Server-Sent Events for live updates
 *   - GET  /agent/status                  → agent status (idle/running)
 */

import { apiGet, apiPost, apiPostForm } from './client'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  lastMessageAt: number
  messageCount: number
}

/** Raw post shape returned by PiClaw /timeline */
export interface TimelinePost {
  id?: number
  rowid?: number
  chat_jid?: string
  timestamp?: string
  role?: string
  author?: string
  content?: string
  text?: string
  body?: string
  data?: {
    type?: string
    content?: string
    text?: string
    agent_id?: string
    thread_id?: string
  }
}

export function normalizeTimelinePost(post: TimelinePost): ChatMessage | null {
  const postData = post.data ?? {}
  const type = postData.type ?? ''
  const isUser = type === 'user_message' || post.role === 'user' || post.author === 'user'
  const content = postData.content ?? postData.text ?? post.content ?? post.text ?? post.body ?? ''
  if (!content) return null
  return {
    id: String(post.id ?? post.rowid ?? Math.random()),
    role: isUser ? 'user' : 'assistant',
    content,
    timestamp: post.timestamp ? new Date(post.timestamp).getTime() : 0,
    metadata: postData as Record<string, unknown>,
  }
}

export async function getAgentStatus(): Promise<{ status: string }> {
  try {
    return await apiGet<{ status: string }>('/agent/status')
  } catch {
    return { status: 'idle' }
  }
}

export async function getSessions(): Promise<ChatSession[]> {
  const data = await apiGet<any>('/agent/session-tree')
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.sessions)) return data.sessions
  if (data && Array.isArray(data.tree)) return data.tree
  return []
}

export async function getTimeline(limit = 50, chatJid?: string): Promise<TimelinePost[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (chatJid) params.set('chat_jid', chatJid)
  const data = await apiGet<{ posts: TimelinePost[] } | TimelinePost[]>(`/timeline?${params}`)
  if (data && !Array.isArray(data) && Array.isArray(data.posts)) return data.posts
  if (Array.isArray(data)) return data
  return []
}

/**
 * Send a message to the agent via POST /agent/default/message.
 * Attachments are referenced in the content AND passed as numeric media_ids —
 * this matches PiClaw's native UI behaviour so the LLM can see the images.
 */
export async function postMessage(content: string, media: MediaUpload[] = []): Promise<void> {
  let fullContent = content
  if (media.length > 0) {
    const refs = media.map((m) => `- attachment:${m.id} (${m.filename})`).join('\n')
    fullContent = `${content}\n\nAttachments:\n${refs}`
  }
  const body: Record<string, unknown> = { content: fullContent }
  if (media.length > 0) body.media_ids = media.map((m) => m.id)
  return apiPost('/agent/default/message', body)
}

/**
 * Abort the currently running agent response.
 * /abort stops LLM generation; /abort-bash kills a running bash process (only sent if requested).
 */
export async function abortAgent(includeAbortBash = false): Promise<void> {
  await apiPost('/agent/default/message', { content: '/abort' }).catch(() => {})
  if (includeAbortBash) {
    await apiPost('/agent/default/message', { content: '/abort-bash' }).catch(() => {})
  }
}

export interface MediaUpload {
  id: number
  filename: string
}

/** Upload a file to PiClaw media store. Returns id + filename for attachment references. */
export async function uploadMedia(file: File): Promise<MediaUpload> {
  const form = new FormData()
  form.append('file', file)
  const data = await apiPostForm<{ id: number; filename: string; name?: string }>('/media/upload', form)
  return { id: data.id, filename: data.filename ?? data.name ?? file.name }
}

/**
 * Connect to PiClaw SSE stream for live updates.
 * PiClaw dispatches this at GET /sse/stream.
 */
export function connectSSE(
  onMessage: (event: MessageEvent) => void,
  onError?: (error: Event) => void,
): EventSource {
  const es = new EventSource('/sse/stream')
  es.onmessage = onMessage
  es.onerror = (e) => { onError?.(e) }
  return es
}
