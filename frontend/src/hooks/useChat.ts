import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/stores/chatStore'
import * as chatApi from '@/api/chat'
import type { TimelinePost } from '@/api/chat'

// How long with no SSE activity before the timeline-based auto-clear is allowed.
// Must be long enough to survive bash commands running between LLM steps (Composer
// installs can take minutes with no SSE). 30s covers most normal operations;
// the 10-min watchdog is the final safety net for truly stuck states.
const SSE_QUIET_THRESHOLD_MS = 30_000

// Watchdog: if streaming is true for this long with zero SSE activity, force-clear.
const STREAMING_WATCHDOG_MS = 10 * 60 * 1000 // 10 minutes

export function useChat() {
  const store = useChatStore()
  const queryClient = useQueryClient()
  const sseRef = useRef<EventSource | null>(null)
  const lastSseActivityAt = useRef<number>(0)
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
        store.clearStreamContent()
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
      (event) => {
        try {
          const data = JSON.parse(event.data)
          lastSseActivityAt.current = Date.now()
          queryClient.invalidateQueries({ queryKey: ['timeline'] })

          if (data.type === 'chunk' || data.type === 'delta') {
            if (useChatStore.getState().isStreaming) {
              store.appendStreamContent(data.content || data.text || '')
            }
          }
          if (data.type === 'done' || data.type === 'complete') {
            // Only clear streaming; keep isAgentRunning=true until the timeline
            // auto-clear confirms the operation is fully done (handles multi-step agents
            // that emit done between sequential tool call groups).
            store.setStreaming(false)
            store.clearStreamContent()
            queryClient.invalidateQueries({ queryKey: ['timeline'] })
          }
        } catch (e) {
          // Non-JSON SSE event (keepalive) — still counts as activity
          if (event.data) console.warn('[SSE] unexpected non-JSON event:', event.data)
          lastSseActivityAt.current = Date.now()
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
  // 3. Only clear if SSE has been quiet for >8s — prevents clearing mid tool-call
  //    when PiClaw posts intermediate agent_response entries between bash commands
  useEffect(() => {
    const { isStreaming, isAgentRunning, streamingStartedAt } = useChatStore.getState()
    if ((!isStreaming && !isAgentRunning) || !streamingStartedAt) return
    if (dataUpdatedAt < streamingStartedAt) return

    const sseQuiet = Date.now() - lastSseActivityAt.current > SSE_QUIET_THRESHOLD_MS
    if (!sseQuiet) return

    const hasNewAgentMsg = messages.some(
      (m) => m.role === 'assistant' && m.timestamp >= streamingStartedAt
    )
    if (hasNewAgentMsg) {
      clearWatchdog()
      store.setStreaming(false)
      store.setAgentRunning(false)
      store.setStreamingStartedAt(null)
      store.clearStreamContent()
    }
  }, [messages, dataUpdatedAt, store])

  const sendMessage = useCallback(async (
    content: string,
    media: chatApi.MediaUpload[] = [],
  ): Promise<{ localId: string; ok: boolean }> => {
    const now = Date.now()
    const localId = `local-${now}`
    lastSseActivityAt.current = now
    const userMsg: chatApi.ChatMessage = {
      id: localId,
      role: 'user',
      content,
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
    store.clearStreamContent()
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
    store.clearStreamContent()
    chatApi.abortAgent()
    queryClient.invalidateQueries({ queryKey: ['timeline'] })
  }, [clearWatchdog, store, queryClient])

  return {
    messages: allMessages,
    isStreaming: store.isStreaming,
    isAgentRunning: store.isAgentRunning,
    streamingContent: store.streamingContent,
    sendMessage,
    cancelStreaming,
  }
}
