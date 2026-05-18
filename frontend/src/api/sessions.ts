const STORAGE_KEY = 'dc-sessions'
const ACTIVE_KEY = 'dc-active-session'

export interface Session {
  id: string
  name: string
  startMessageId: number
  createdAt: number
  archived?: boolean
}

function formatSessionName(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSessions(sessions: Session[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function createSession(startMessageId: number, name?: string): Session {
  const now = Date.now()
  const session: Session = {
    id: crypto.randomUUID(),
    name: name ?? formatSessionName(now),
    startMessageId,
    createdAt: now,
  }
  const sessions = loadSessions()
  sessions.push(session)
  saveSessions(sessions)
  return session
}

export function updateSession(id: string, patch: Partial<Pick<Session, 'name' | 'archived'>>): void {
  const sessions = loadSessions()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) return
  sessions[idx] = { ...sessions[idx], ...patch }
  saveSessions(sessions)
}

export function deleteSession(id: string): void {
  saveSessions(loadSessions().filter((s) => s.id !== id))
}

export function getActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveSessionId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}
