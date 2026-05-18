import { useEffect, useState, useRef, useCallback } from 'react'
import { connectTerminal } from '@/api/terminal'

export type ContainerState = 'running' | 'exited' | 'paused' | 'created' | 'restarting' | 'removing' | 'dead'

export interface ContainerInfo {
  name: string
  state: ContainerState | string
  status: string   // e.g. 'Up 3 days (healthy)' | 'Exited (1) 2 hours ago'
}

// Unique markers so we can reliably identify docker ps output in the PTY stream
const START = '___DS_START___'
const END = '___DS_END___'

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')          // CSI sequences incl. \x1b[?...
    .replace(/\x1b\][^\x07]*\x07/g, '')               // OSC sequences
    .replace(/\x1b[A-Za-z()\[\]0-9=><]/g, '')        // two-char escapes like \x1b(B
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, '') // other control chars (not \n)
    .replace(/\r/g, '')
}

export function useDockerStats(refreshMs = 8000) {
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [loading, setLoading] = useState(true)

  const sendRef = useRef<((data: string) => void) | null>(null)
  const bufRef = useRef('')
  const collectingRef = useRef(false)
  const linesRef = useRef<string[]>([])

  const poll = useCallback(() => {
    sendRef.current?.(
      `echo '${START}'; docker ps -a --format '{{.Names}}|{{.State}}|{{.Status}}' 2>&1; echo '${END}'\r`
    )
  }, [])

  useEffect(() => {
    let mounted = true
    let intervalId: ReturnType<typeof setInterval> | null = null
    let connClose: (() => void) | null = null

    const BASH_STARTUP_DELAY_MS = 600

    connectTerminal(
      (raw) => {
        const text = stripAnsi(raw)
        bufRef.current += text
        const lines = bufRef.current.split('\n')
        bufRef.current = lines.pop() ?? ''

        for (const line of lines) {
          const t = line.trim()
          if (t.includes(START)) {
            collectingRef.current = true
            linesRef.current = []
          } else if (t.includes(END)) {
            collectingRef.current = false
            if (!mounted) break
            const parsed = linesRef.current
              .filter(l => l.includes('|'))
              .map(l => {
                const parts = l.split('|')
                return {
                  name: parts[0]?.trim() ?? '',
                  state: parts[1]?.trim() ?? '',
                  status: parts.slice(2).join('|').trim(),
                }
              })
              .filter(c => c.name)
            setContainers(parsed)
            setLoading(false)
          } else if (collectingRef.current && t) {
            linesRef.current.push(t)
          }
        }
      },
      undefined,
      undefined,
      'piclaw_docker_client',
    ).then(conn => {
      if (!mounted) { conn.close(); return }
      connClose = conn.close.bind(conn)
      sendRef.current = conn.send.bind(conn)

      // Wait for bash to start, then begin polling
      setTimeout(() => {
        if (!mounted) return
        poll()
        intervalId = setInterval(() => { if (mounted) poll() }, refreshMs)
      }, BASH_STARTUP_DELAY_MS)
    }).catch((err) => {
      console.error('[docker-stats] PTY connection failed:', err)
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
      connClose?.()
      sendRef.current = null
    }
  }, [poll, refreshMs])

  const send = useCallback((cmd: string) => {
    sendRef.current?.(`${cmd}\r`)
  }, [])

  const restart = useCallback((name: string) => send(`docker restart ${name}`), [send])
  const stop    = useCallback((name: string) => send(`docker stop ${name}`),    [send])
  const start   = useCallback((name: string) => send(`docker start ${name}`),   [send])

  return { containers, loading, restart, stop, start, refresh: poll }
}
