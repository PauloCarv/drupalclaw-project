import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/stores/chatStore'
import * as chatApi from '@/api/chat'
import type { TimelinePost } from '@/api/chat'

// After streaming completes (done event received), wait this long before clearing.
// Short because the response is already in the timeline — just need a buffer for
// PiClaw to flush any final timeline writes.
const SSE_QUIET_AFTER_STREAM_MS = 4_000

// When agent is running but no streaming ever started (background tool-use, bash
// commands mid-conversation), use a longer threshold to survive Composer installs etc.
const SSE_QUIET_BACKGROUND_MS = 30_000

// Watchdog: if streaming is true for this long with zero SSE activity, force-clear.
const STREAMING_WATCHDOG_MS = 10 * 60 * 1000 // 10 minutes

export function useChat() {
  const store = useChatStore()
  const queryClient = useQueryClient()
  const sseRef = useRef<EventSource | null>(null)
  const lastSseActivityAt = useRef<number>(0)
  const streamingCompletedAt = useRef<number>(0)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
  }, [])

  const scheduleWatchdog = useCallback(() => {
    clearWatchdog()
    watchdogRef.current = setTimeout(() => {
      const s = useChatStore.getState()
      if (s.isStreaming || s.isAgentRunning) {
        store.setStreaming(false)
        store.setAgentRunning(false)
        store.setStreamingStartedAt(null)
        store.clearActivity()
        queryClient.invalidateQueries({ queryKey: ['timeline'] })
      }
    }, STREAMING_WATCHDOG_MS)
  }, [clearWatchdog, store, queryClient])

  // Poll faster while agent is active (streaming or background processing), slower otherwise
  const { data: timeline, dataUpdatedAt } = useQuery({
    queryKey: ['timeline'],
    queryFn: () => chatApi.getTimeline(50),
    refetchInterval: (store.isStreaming || store.isAgentRunning) ? 2000 : 5000,
  })


  // Connect SSE for live updates
  useEffect(() => {
    const es = chatApi.connectSSE(
      (eventType, data) => {
        const d = (data ?? {}) as Record<string, unknown>

        // Only agent processing events count toward the SSE quiet timer.
        // new_post, agent_response, heartbeat etc. are informational — if they
        // reset the timer, the quiet check never passes after 'done' fires.
        const isAgentProcessing = eventType === 'agent_thought' || eventType === 'agent_draft' ||
          eventType === 'agent_status'
        if (isAgentProcessing) {
          lastSseActivityAt.current = Date.now()
          // Reset watchdog on each agent event — so it's "10min of silence", not "10min absolute"
          // This lets long-running skills (drupal-serve, drupal-init) run beyond 10 minutes
          if (useChatStore.getState().isAgentRunning) scheduleWatchdog()
        }

        if (eventType === 'new_post' || eventType === 'agent_response') {
          queryClient.invalidateQueries({ queryKey: ['timeline'] })
          return
        }

        if (eventType === 'agent_thought') {
          store.setThought(String(d.text ?? ''))
          return
        }

        if (eventType === 'agent_draft') {
          const text = String(d.text ?? '')
          store.setDraft(text)
          if (text && useChatStore.getState().isStreaming) {
            store.setStreamContent(text)
          }
          return
        }

        if (eventType === 'agent_status') {
          const type = String(d.type ?? '')
          const title = String(d.title ?? '')
          const toolName = d.tool_name ? String(d.tool_name) : undefined

          if (type === 'done') {
            streamingCompletedAt.current = Date.now()
            store.setStreaming(false)
            store.setStreamContent('')
            queryClient.invalidateQueries({ queryKey: ['timeline'] })
          } else if (type === 'tool_call') {
            store.pushActivityItem({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: 'tool', title, toolName, status: 'working', ts: Date.now(),
            })
          } else if (type === 'tool_status') {
            const s = String(d.status ?? '')
            if (s === 'Done') store.updateLastToolStatus(toolName ?? '', 'done', title)
            else if (s === 'Failed') store.updateLastToolStatus(toolName ?? '', 'failed', title)
          } else if (type === 'intent') {
            store.pushActivityItem({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: 'intent', title, status: 'info', ts: Date.now(),
            })
          } else if (type === 'error') {
            store.pushActivityItem({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: 'error', title, status: 'failed', ts: Date.now(),
            })
          }
        }
      },
      () => { /* SSE error — auto-reconnects */ },
    )
    sseRef.current = es
    return () => { es.close(); sseRef.current = null }
  }, [queryClient, store])

  // Normalize timeline posts into ChatMessage format
  const messages: chatApi.ChatMessage[] = (timeline ?? [])
    .map((post: TimelinePost) => chatApi.normalizeTimelinePost(post))
    .filter((m): m is chatApi.ChatMessage => m !== null)

  // Auto-clear when a new agent message appears in the timeline.
  // Guards:
  // 1. Only run while agent is considered active (streaming or background running)
  // 2. Only consider data fetched AFTER agent started (avoids stale cache from other tabs)
  // 3. Only clear if SSE has been quiet long enough:
  //    - 4s after streaming completes (done event) — fast path for normal chat
  //    - 30s otherwise — covers background tool-use and Composer installs
  useEffect(() => {
    const { isStreaming, isAgentRunning, streamingStartedAt } = useChatStore.getState()
    if ((!isStreaming && !isAgentRunning) || !streamingStartedAt) return
    if (dataUpdatedAt < streamingStartedAt) return

    const now = Date.now()
    const threshold = streamingCompletedAt.current > streamingStartedAt
      ? SSE_QUIET_AFTER_STREAM_MS
      : SSE_QUIET_BACKGROUND_MS
    const sseQuiet = now - lastSseActivityAt.current > threshold
    if (!sseQuiet) return

    const hasNewAgentMsg = messages.some(
      (m) => m.role === 'assistant' && m.timestamp >= streamingStartedAt
    )
    if (hasNewAgentMsg) {
      clearWatchdog()
      store.setStreaming(false)
      store.setAgentRunning(false)
      store.setStreamingStartedAt(null)
      store.clearActivity()
    }
  }, [messages, dataUpdatedAt, store])

  const sendMessage = useCallback(async (
    content: string,
    media: chatApi.MediaUpload[] = [],
  ): Promise<{ localId: string; ok: boolean }> => {
    const now = Date.now()
    const localId = `local-${now}`
    lastSseActivityAt.current = now
    streamingCompletedAt.current = 0
    // Build the same content string that PiClaw will store (with attachment block)
    // so the deduplication check (t.content === m.content) works correctly.
    let localContent = content
    if (media.length > 0) {
      localContent += '\n\nAttachments:\n' + media.map(m => `- attachment:${m.id} (${m.filename})`).join('\n')
    }
    const userMsg: chatApi.ChatMessage = {
      id: localId,
      role: 'user',
      content: localContent,
      timestamp: now,
    }
    store.addMessage(userMsg)

    // Only anchor streamingStartedAt on the first message of a batch.
    // If a second message is sent while the agent is already running, the anchor stays
    // at the first send time — the SSE quiet guard prevents premature clearing while
    // the second message is still being processed.
    if (!useChatStore.getState().streamingStartedAt) {
      store.setStreamingStartedAt(now)
    }
    store.setStreaming(true)
    store.setAgentRunning(true)
    store.clearActivity()
    scheduleWatchdog()

    try {
      await chatApi.postMessage(content, media)
      return { localId, ok: true }
    } catch (err) {
      console.error('Failed to send message:', err)
      clearWatchdog()
      store.setStreaming(false)
      store.setAgentRunning(false)
      store.setStreamingStartedAt(null)
      return { localId, ok: false }
    }
  }, [store, scheduleWatchdog])

  const timelineIds = new Set(messages.map((m) => m.id))
  const allMessages = [
    ...messages,
    ...store.messages.filter((m) => {
      // Optimistic local messages (id starts with 'local-') are deduplicated by
      // content+role — their server id will be different once the timeline returns them.
      if (m.id.startsWith('local-')) {
        return !messages.some((t) => t.content === m.content && t.role === m.role)
      }
      return !timelineIds.has(m.id)
    }),
  ].sort((a, b) => a.timestamp - b.timestamp)

  const cancelStreaming = useCallback(() => {
    clearWatchdog()
    store.setStreaming(false)
    store.setAgentRunning(false)
    store.setStreamingStartedAt(null)
    store.clearActivity()
    chatApi.abortAgent()
    queryClient.invalidateQueries({ queryKey: ['timeline'] })
  }, [clearWatchdog, store, queryClient])

  return {
    messages: allMessages,
    isStreaming: store.isStreaming,
    isAgentRunning: store.isAgentRunning,
    streamingContent: store.streamingContent,
    streamingStartedAt: store.streamingStartedAt,
    sendMessage,
    cancelStreaming,
  }
}
