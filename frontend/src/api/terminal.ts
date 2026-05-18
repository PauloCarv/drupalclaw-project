const DEFAULT_STORAGE_KEY = 'piclaw_terminal_client'
const CLIENT_HEADER = 'x-piclaw-terminal-client'

function getClientToken(storageKey = DEFAULT_STORAGE_KEY): string {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) return stored
    const token = `terminal-client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(storageKey, token)
    return token
  } catch {
    return `terminal-client-${Date.now().toString(36)}`
  }
}

export interface TerminalConnection {
  send: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

export async function connectTerminal(
  onData: (data: string) => void,
  onClose?: () => void,
  onOpen?: (send: (data: string) => void) => void,
  storageKey?: string  // pass a different key to get an independent PTY session
): Promise<TerminalConnection> {
  const client = getClientToken(storageKey)

  // Get session info (ws_path may vary)
  let wsPath = '/terminal/ws'
  try {
    const res = await fetch('/terminal/session', {
      credentials: 'same-origin',
      headers: { [CLIENT_HEADER]: client },
    })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      if (typeof data?.ws_path === 'string') wsPath = data.ws_path
    }
  } catch {
    // fall through with default path
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${protocol}//${window.location.host}${wsPath}`)
  url.searchParams.set('client', client)

  const ws = new WebSocket(url.toString())

  ws.onmessage = (event) => {
    let msg: { type: string; data?: string } | null = null
    try {
      msg = JSON.parse(String(event.data))
    } catch {
      msg = { type: 'output', data: String(event.data) }
    }
    if (msg?.type === 'output' && msg.data != null) {
      onData(msg.data)
    }
  }

  const send = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  }

  ws.onopen = () => onOpen?.(send)
  ws.onclose = () => onClose?.()
  ws.onerror = () => onClose?.()

  return {
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    },
    resize: (cols, rows) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    },
    close: () => ws.close(),
  }
}
