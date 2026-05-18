import { useEffect, useRef } from 'react'
import 'xterm/css/xterm.css'
import { connectTerminal, type TerminalConnection } from '@/api/terminal'
import { useSettingsStore } from '@/stores/settingsStore'

interface UseTerminalOptions {
  storageKey?: string  // separate PTY session (different client token)
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: UseTerminalOptions,
) {
  const connectionRef = useRef<TerminalConnection | null>(null)
  const termRef = useRef<import('xterm').Terminal | null>(null)
  const fitAddonRef = useRef<import('xterm-addon-fit').FitAddon | null>(null)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const fontSizeRef = useRef(fontSize)
  fontSizeRef.current = fontSize

  // Update running terminal when font size changes (separate from init effect)
  useEffect(() => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return
    term.options.fontSize = fontSize
    fitAddon.fit()
  }, [fontSize])

  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true

    async function init() {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')
      const { WebLinksAddon } = await import('xterm-addon-web-links')

      if (!mounted || !containerRef.current) return

      // Ensure Nerd Font is loaded before terminal renders on Canvas.
      // Using FontFace API directly is more reliable than document.fonts.load()
      // because it doesn't depend on @font-face CSS being parsed first.
      try {
        const nerdFont = new FontFace(
          'FiraCode Nerd Font Mono',
          'url(/static/fonts/vendor/firacode-nerd-font-mono-regular.ttf)',
          { weight: '400', style: 'normal' }
        )
        await nerdFont.load()
        document.fonts.add(nerdFont)
      } catch { /* fall through — terminal still works, just without Nerd Font icons */ }

      if (!mounted || !containerRef.current) return

      const term = new Terminal({
        theme: {
          background: '#0A1525',
          foreground: '#CFD8DC',
          cursor: '#00B4D8',
          selectionBackground: '#1A2D44',
          black: '#0D1B2A',
          red: '#EF476F',
          green: '#06D6A0',
          yellow: '#F77F00',
          blue: '#0678BE',
          magenta: '#BD93F9',
          cyan: '#00B4D8',
          white: '#E0E0E0',
        },
        fontFamily: "'FiraCode Nerd Font Mono', 'FiraCode NF', 'JetBrains Mono', monospace",
        fontSize: fontSizeRef.current,
        cursorBlink: true,
        scrollback: 5000,
      })

      const fitAddon = new FitAddon()
      fitAddonRef.current = fitAddon
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current)
      fitAddon.fit()

      termRef.current = term

      // Connect to PiClaw terminal PTY
      const connection = await connectTerminal(
        (data) => term.write(data),
        () => term.write('\r\n[Connection closed]\r\n'),
        undefined,
        options?.storageKey,
      )

      if (!mounted) { connection.close(); return }
      connectionRef.current = connection

      // Send initial terminal size (fitAddon.fit() fired before onResize was registered)
      connection.resize(term.cols, term.rows)

      // Send user input to PTY
      term.onData((data) => connection.send(data))

      // Handle resize
      term.onResize(({ cols, rows }) => connection.resize(cols, rows))

      // Observe container resize
      const observer = new ResizeObserver(() => fitAddon.fit())
      observer.observe(containerRef.current!)

      return () => observer.disconnect()
    }

    init()

    return () => {
      mounted = false
      connectionRef.current?.close()
      termRef.current?.dispose()
    }
  }, [containerRef])

  const sendCommand = (cmd: string) => {
    connectionRef.current?.send(cmd + '\r')
  }

  // Send raw bytes without appending \r (e.g. Ctrl+C = '\x03')
  const sendRaw = (data: string) => {
    connectionRef.current?.send(data)
  }

  return { terminal: termRef, sendCommand, sendRaw }
}
