/**
 * Base HTTP client for PiClaw API communication.
 * All API calls go through this client for consistent error handling.
 */

const BASE_URL = ''  // Same origin — Vite proxy in dev, served by PiClaw in prod

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message?: string
  ) {
    super(message || `API Error: ${status} ${statusText}`)
    this.name = 'ApiError'
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.json()
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    // Try to read JSON body even on error (PiClaw may include useful data)
    let data: any = null
    try { data = await res.json() } catch { /* no json body */ }
    if (data) {
      // Return the data — let the caller decide if it's useful
      // Attach status info for callers that need it
      if (typeof data === 'object') {
        data.__httpStatus = res.status
        data.__httpStatusText = res.statusText
      }
      return data as T
    }
    throw new ApiError(res.status, res.statusText)
  }
  return res.json()
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.json()
}

/** POST with FormData body — for file uploads (no Content-Type header, browser sets boundary). */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
}

/**
 * Creates an SSE (Server-Sent Events) connection for streaming responses.
 */
export function createSSEStream(
  path: string,
  body: unknown,
  onMessage: (data: string) => void,
  onError?: (error: Error) => void,
  onDone?: () => void
): AbortController {
  const controller = new AbortController()

  fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, res.statusText)
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              onDone?.()
              return
            }
            onMessage(data)
          }
        }
      }
      onDone?.()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err)
      }
    })

  return controller
}
