import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSessionStore } from '@/stores/sessionStore'
import * as sessionsApi from '@/api/sessions'
import * as chatApi from '@/api/chat'

export function useSession() {
  const store = useSessionStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    let sessions = sessionsApi.loadSessions()

    if (sessions.length === 0) {
      const initial = sessionsApi.createSession(0, 'Initial chat')
      sessions = [initial]
    }

    store.setSessions(sessions)

    const savedId = sessionsApi.getActiveSessionId()
    const valid = sessions.find((s) => s.id === savedId)
    const defaultId = sessions[sessions.length - 1].id
    store.setActiveSession(valid?.id ?? defaultId)
  }, [])

  const sessions = store.sessions
  const activeSessionId = store.activeSessionId
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const currentSession = sessions[sessions.length - 1] ?? null
  const isCurrentSession = activeSessionId === currentSession?.id

  // For a given session, compute the upper boundary (exclusive) — the startMessageId of the next session.
  function getSessionBounds(session: sessionsApi.Session): { start: number; end?: number } {
    const idx = sessions.findIndex((s) => s.id === session.id)
    const next = sessions[idx + 1]
    return { start: session.startMessageId, end: next?.startMessageId }
  }

  const createNewSession = useCallback(async () => {
    const posts = await chatApi.getTimeline(1)
    const lastId = posts.length > 0 ? Number(posts[posts.length - 1].id ?? 0) : 0
    const startMessageId = lastId + 1

    await chatApi.restartAgent()

    const session = sessionsApi.createSession(startMessageId)
    const updated = sessionsApi.loadSessions()
    store.setSessions(updated)
    store.setActiveSession(session.id)
    sessionsApi.saveActiveSessionId(session.id)
    queryClient.invalidateQueries({ queryKey: ['timeline'] })

    return session
  }, [store, queryClient])

  const switchSession = useCallback((id: string) => {
    store.setActiveSession(id)
    sessionsApi.saveActiveSessionId(id)
  }, [store])

  const renameSession = useCallback((id: string, name: string) => {
    sessionsApi.updateSession(id, { name })
    store.setSessions(sessionsApi.loadSessions())
  }, [store])

  const archiveSession = useCallback((id: string) => {
    sessionsApi.updateSession(id, { archived: true })
    store.setSessions(sessionsApi.loadSessions())
  }, [store])

  const unarchiveSession = useCallback((id: string) => {
    sessionsApi.updateSession(id, { archived: false })
    store.setSessions(sessionsApi.loadSessions())
  }, [store])

  const deleteSessionById = useCallback((id: string) => {
    sessionsApi.deleteSession(id)
    const updated = sessionsApi.loadSessions()
    store.setSessions(updated)
    if (store.activeSessionId === id) {
      const fallback = updated[updated.length - 1]?.id ?? null
      store.setActiveSession(fallback)
      sessionsApi.saveActiveSessionId(fallback)
    }
  }, [store])

  return {
    sessions,
    activeSession,
    activeSessionId,
    currentSession,
    isCurrentSession,
    getSessionBounds,
    createNewSession,
    switchSession,
    renameSession,
    archiveSession,
    unarchiveSession,
    deleteSessionById,
  }
}
