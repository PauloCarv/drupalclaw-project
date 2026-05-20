import { connectTerminal } from './terminal'

const FS_CLIENT_KEY = 'piclaw_fs_client'

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[A-Za-z()[\]0-9=><]/g, '')
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\r/g, '')
}

// Run a shell command in the workspace container and resolve when done.
// Uses a dedicated headless PTY session (never shown in terminal UI).
export async function runWorkspaceCommand(cmd: string, timeoutMs = 15000, storageKey = FS_CLIENT_KEY): Promise<void> {
  const MARKER = `__DC_FS_${Date.now()}_${Math.random().toString(36).slice(2)}__`
  let buffer = ''
  let settled = false
  let resolvePromise!: () => void
  let rejectPromise!: (err: Error) => void

  const promise = new Promise<void>((res, rej) => {
    resolvePromise = res
    rejectPromise = rej
  })

  const settle = (ok: boolean, err?: Error) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    conn.then(c => c.close()).catch(() => {})
    if (ok) resolvePromise()
    else rejectPromise(err ?? new Error('Command failed'))
  }

  const timer = setTimeout(() => settle(false, new Error('timeout')), timeoutMs)

  const conn = connectTerminal(
    (data) => {
      buffer += stripAnsi(data)
      if (buffer.includes(MARKER)) settle(true)
    },
    () => { if (!settled) settle(false, new Error('Connection closed')) },
    (send) => {
      send(`${cmd} && echo "${MARKER}"\r`)
    },
    storageKey,
  )

  return promise
}
