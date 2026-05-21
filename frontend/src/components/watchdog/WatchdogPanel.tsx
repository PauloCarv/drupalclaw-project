import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Loader2, Search, AlertCircle, RotateCcw } from 'lucide-react'
import { useLayoutStore } from '@/stores/layoutStore'
import { useChat } from '@/hooks/useChat'

interface WatchdogEntry {
  wid: string | number
  type: string
  message: string
  severity: string | number
  timestamp?: string | number
  date?: string
  hostname?: string
  uid?: string | number
  username?: string
  location?: string
}

type SeverityGroup = 'all' | 'error' | 'warning' | 'notice' | 'info' | 'debug'

function normalizeSeverity(severity: string | number): SeverityGroup {
  const s = String(severity).toLowerCase()
  if (['0', '1', '2', '3', 'emergency', 'alert', 'critical', 'error'].includes(s)) return 'error'
  if (['4', 'warning'].includes(s)) return 'warning'
  if (['5', 'notice'].includes(s)) return 'notice'
  if (['6', 'info', 'information', 'informational'].includes(s)) return 'info'
  return 'debug'
}

const SEVERITY_META: Record<SeverityGroup, { label: string; dot: string; badge: string }> = {
  all:     { label: 'Todos',  dot: 'bg-navy-400',     badge: 'bg-navy-600 text-navy-300' },
  error:   { label: 'Erro',   dot: 'bg-accent-red',   badge: 'bg-red-900/40 text-red-300' },
  warning: { label: 'Aviso',  dot: 'bg-yellow-400',   badge: 'bg-yellow-900/40 text-yellow-300' },
  notice:  { label: 'Nota',   dot: 'bg-blue-400',     badge: 'bg-blue-900/40 text-blue-300' },
  info:    { label: 'Info',   dot: 'bg-accent-green', badge: 'bg-green-900/40 text-green-300' },
  debug:   { label: 'Debug',  dot: 'bg-navy-400',     badge: 'bg-navy-700 text-navy-400' },
}

const FILTER_ORDER: SeverityGroup[] = ['all', 'error', 'warning', 'notice', 'info', 'debug']

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
}

function formatDate(entry: WatchdogEntry): string {
  if (entry.date) return entry.date
  if (!entry.timestamp) return ''
  const n = typeof entry.timestamp === 'string' ? parseInt(entry.timestamp, 10) : entry.timestamp
  if (isNaN(n) || n <= 0) return String(entry.timestamp)
  return new Date(n * 1000).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

async function loadWatchdogCache(): Promise<WatchdogEntry[]> {
  const res = await fetch(`/workspace/file?path=${encodeURIComponent('.piclaw/watchdog.json')}`)
  if (!res.ok) throw new Error('not found')
  const envelope = await res.json()
  const raw: string = envelope.text ?? envelope.content ?? ''
  if (!raw) return []
  const data = JSON.parse(raw)
  // drush watchdog:show --format=json returns an object keyed by wid, not an array
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') return Object.values(data) as WatchdogEntry[]
  return []
}

export function WatchdogPanel() {
  const [entries, setEntries] = useState<WatchdogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<SeverityGroup>('all')
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setMainTab = useLayoutStore(s => s.setMainTab)
  const { sendMessage, isAgentRunning } = useChat()

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadWatchdogCache()
      setEntries(data)
    } catch {
      setError('Cache not found. Click "Refresh" to generate the data.')
      setEntries(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleRefresh = useCallback(() => {
    if (isAgentRunning || updating) return
    setUpdating(true)
    sendMessage('/skill:drupal-watchdog-cache')

    // Poll file mtime every 2s — reload as soon as the skill writes the file,
    // without waiting for the 8s SSE quiet period.
    const sendTime = Date.now()
    let polls = 0
    stopPolling()
    pollRef.current = setInterval(async () => {
      polls++
      try {
        const res = await fetch(`/workspace/file?path=${encodeURIComponent('.piclaw/watchdog.json')}`)
        if (!res.ok) { if (polls >= 15) { stopPolling(); setUpdating(false) }; return }
        const env = await res.json()
        if (env.truncated) {
          // File still too large — keep polling in case skill re-runs; give up after timeout
          if (polls >= 15) { stopPolling(); setError('Watchdog file too large for the API. Wait for the next run.'); setUpdating(false) }
          return
        }
        if (env.mtime && new Date(env.mtime).getTime() >= sendTime) {
          stopPolling()
          const raw: string = env.text ?? ''
          try {
            const data = raw ? JSON.parse(raw) : null
            if (data) {
              setEntries(Array.isArray(data) ? data : Object.values(data) as WatchdogEntry[])
              setError(null)
            }
          } catch {
            setError('Erro ao processar JSON do watchdog.')
          }
          setUpdating(false)
          return
        }
      } catch {}
      if (polls >= 15) { stopPolling(); setUpdating(false) }
    }, 2000)
  }, [sendMessage, isAgentRunning, updating, stopPolling])

  const handleRowClick = useCallback((entry: WatchdogEntry) => {
    const msg = [
      'Analisa este registo do watchdog Drupal:',
      '',
      `Tipo: ${entry.type}`,
      `Severidade: ${String(entry.severity)}`,
      `Mensagem: ${stripHtml(String(entry.message))}`,
      `Data: ${formatDate(entry)}`,
      entry.hostname ? `Host: ${entry.hostname}` : '',
      entry.location ? `URL: ${entry.location}` : '',
    ].filter(Boolean).join('\n')
    sendMessage(msg)
    setMainTab('chat')
  }, [sendMessage, setMainTab])

  const counts = (entries ?? []).reduce<Record<SeverityGroup, number>>(
    (acc, e) => {
      const g = normalizeSeverity(e.severity)
      acc[g] = (acc[g] ?? 0) + 1
      acc.all = (acc.all ?? 0) + 1
      return acc
    },
    { all: 0, error: 0, warning: 0, notice: 0, info: 0, debug: 0 }
  )

  const visible = (entries ?? []).filter(e => {
    if (filter !== 'all' && normalizeSeverity(e.severity) !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        String(e.message).toLowerCase().includes(q) ||
        String(e.type).toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-navy-500 flex-shrink-0">
        <span className="text-xs font-medium text-gray-300 flex-1">Watchdog</span>

        {updating && (
          <span className="flex items-center gap-1 text-[10px] text-ai-teal">
            <Loader2 size={10} className="animate-spin" />
            A actualizar...
          </span>
        )}

        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="bg-navy-700 text-xs text-gray-300 pl-6 pr-2 py-1 rounded border border-navy-500 focus:outline-none focus:border-drupal-blue w-40 placeholder:text-navy-400"
          />
        </div>

        <button
          onClick={reload}
          disabled={loading || updating}
          className="text-navy-400 hover:text-gray-300 disabled:opacity-40 transition-colors"
          title="Recarregar da cache"
        >
          <RotateCcw size={11} className={loading && !updating ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={handleRefresh}
          disabled={isAgentRunning || updating}
          className="flex items-center gap-1 text-[10px] bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded transition-colors flex-shrink-0"
          title="Executar drupal-watchdog-cache e recarregar"
        >
          <RefreshCw size={10} className={updating ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Severity filter badges */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-navy-500 flex-shrink-0 overflow-x-auto">
        {FILTER_ORDER.map(f => {
          const meta = SEVERITY_META[f]
          const count = counts[f] ?? 0
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors ${
                active ? `${meta.badge} ring-1 ring-current` : 'text-navy-400 hover:text-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
              {meta.label}
              <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-navy-400">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">A carregar...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <AlertCircle size={20} className="text-navy-400" />
            <p className="text-xs text-navy-300 max-w-xs">{error}</p>
            <button
              onClick={handleRefresh}
              disabled={isAgentRunning || updating}
              className="flex items-center gap-1.5 text-xs bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
            >
              {updating
                ? <><Loader2 size={11} className="animate-spin" /> A executar...</>
                : <><RefreshCw size={11} /> Gerar watchdog</>
              }
            </button>
          </div>
        )}

        {!loading && !error && entries !== null && visible.length === 0 && (
          <div className="text-xs text-navy-400 text-center py-16">
            {search || filter !== 'all'
              ? 'Sem resultados para os filtros seleccionados'
              : 'Sem registos no watchdog'}
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-navy-800 z-10">
              <tr className="text-navy-400 border-b border-navy-600">
                <th className="text-left px-3 py-1.5 font-medium w-20">Sev.</th>
                <th className="text-left px-3 py-1.5 font-medium w-28">Tipo</th>
                <th className="text-left px-3 py-1.5 font-medium">Mensagem</th>
                <th className="text-right px-3 py-1.5 font-medium w-28 whitespace-nowrap">Data/hora</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, i) => {
                const g = normalizeSeverity(entry.severity)
                const meta = SEVERITY_META[g]
                return (
                  <tr
                    key={`${String(entry.wid)}-${i}`}
                    onClick={() => handleRowClick(entry)}
                    className="border-b border-navy-600/40 cursor-pointer hover:bg-navy-700/50 transition-colors group"
                  >
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-navy-300 truncate max-w-[7rem]">
                      {entry.type}
                    </td>
                    <td className="px-3 py-1.5 text-gray-300 max-w-0">
                      <span className="block truncate group-hover:text-white transition-colors">
                        {stripHtml(String(entry.message))}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-navy-400 text-right whitespace-nowrap">
                      {formatDate(entry)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!loading && entries !== null && (
        <div className="px-4 py-1.5 border-t border-navy-500 text-[10px] text-navy-400 flex items-center gap-2 flex-shrink-0">
          <span>{visible.length} de {entries.length} registos</span>
          {entries.length > 0 && (
            <span className="opacity-50">· clica numa linha para analisar no chat</span>
          )}
        </div>
      )}
    </div>
  )
}
