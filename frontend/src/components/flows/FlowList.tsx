import { useState, useCallback, useEffect } from 'react'
import { Play, Pencil, Trash2, Zap, MessageSquare, Loader2, Clock, Calendar, ChevronRight, ChevronDown, History, MousePointerClick, Send, Puzzle } from 'lucide-react'
import type { Flow, FlowRun } from '@/api/flows'
import { getFlowRuns } from '@/api/flows'
import { postMessage } from '@/api/chat'
import { useLayoutStore } from '@/stores/layoutStore'
import { useChatStore } from '@/stores/chatStore'

// Module-level: survives tab switches (component remounts)
const _cache: Record<string, FlowRun[]> = {}
let _expandedId: string | null = null
const _triggerSince: Record<string, number> = {}
const _consecutiveFails: Record<string, number> = {}
const POLL_TIMEOUT_MS = 5 * 60 * 1000
const MAX_CONSECUTIVE_FAILS = 5

function fmtRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'há pouco'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return new Date(ts).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
}

interface RunStatusBadgeProps {
  run: FlowRun
  flowName: string
  onSendToChat: (text: string) => void
}

function RunStatusBadge({ run, flowName, onSendToChat }: RunStatusBadgeProps) {
  const [expanded, setExpanded] = useState(false)
  const ok = run.status === 'completed' || run.status === 'success'
  const isRunningStatus = run.status === 'running'
  const statusColor = ok ? 'text-accent-green' : isRunningStatus ? 'text-ai-teal' : 'text-accent-red'
  const isManual = run.scheduleType === 'once'
  const hasOutput = ok || !!run.error

  const handleExpand = () => {
    if (isRunningStatus) return
    setExpanded(prev => !prev)
  }

  const handleSendToChat = (e: React.MouseEvent) => {
    e.stopPropagation()
    const output = run.error ? `ERRO:\n${run.error}\n\n${run.result ?? ''}` : (run.result ?? '')
    onSendToChat(`Analisa os resultados do flow "${flowName}":\n\n${output}`)
  }

  return (
    <div className="border-b border-navy-600/50 last:border-0">
      <button
        onClick={handleExpand}
        className={`w-full flex items-center gap-2 py-1.5 text-left ${hasOutput ? 'cursor-pointer hover:bg-navy-600/20' : 'cursor-default'} rounded px-1 -mx-1`}
      >
        {isRunningStatus
          ? <Loader2 size={10} className="text-ai-teal animate-spin flex-shrink-0 w-3" />
          : <span className={`text-[10px] font-mono w-3 flex-shrink-0 ${statusColor}`}>{ok ? '✓' : '✗'}</span>
        }
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] flex-shrink-0 ${
          isManual ? 'bg-drupal-blue/20 text-drupal-blue-light' : 'bg-ai-teal/15 text-ai-teal'
        }`}>
          {isManual ? <MousePointerClick size={8} /> : <Calendar size={8} />}
          <span>{isManual ? 'Manual' : 'Agendado'}</span>
        </div>
        <span className="text-[10px] text-navy-200">{fmtRelative(new Date(run.runAt).getTime())}</span>
        {run.durationMs > 0 && <span className="text-[10px] text-navy-300">{fmtDuration(run.durationMs)}</span>}
        {isRunningStatus && <span className="text-[10px] text-ai-teal">A executar...</span>}
        {run.error && !expanded && <span className="text-[10px] text-accent-red truncate max-w-[100px]">{run.error}</span>}
        {hasOutput && <ChevronDown size={10} className={`ml-auto text-navy-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />}
      </button>
      {expanded && (
        <div className="mb-2">
          <div className="rounded bg-navy-900/60 border border-navy-600/40 p-2 max-h-48 overflow-y-auto">
            <pre className="text-[10px] text-navy-200 whitespace-pre-wrap font-mono leading-relaxed">
              {run.error ? `ERRO:\n${run.error}\n\n${run.result ?? ''}` : (run.result ?? 'Sem output')}
            </pre>
          </div>
          {(run.result || run.error) && (
            <button
              onClick={handleSendToChat}
              className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-navy-300 hover:text-white border border-navy-600 hover:border-navy-400 rounded-lg transition-colors"
            >
              <Send size={9} /> Analisar no chat
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface RunModalProps {
  flow: Flow
  onRun: (params: Record<string, string>) => void
  onClose: () => void
}

function RunModal({ flow, onRun, onClose }: RunModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(flow.params.map(p => [p.key, p.default ?? '']))
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-navy-500 rounded-xl w-full max-w-sm shadow-2xl">
        <div className="px-5 py-4 border-b border-navy-500">
          <h3 className="text-sm font-semibold text-white">{flow.name}</h3>
          {flow.description && <p className="text-[11px] text-navy-400 mt-0.5">{flow.description}</p>}
        </div>
        <div className="p-5 space-y-3">
          {flow.params.map(param => (
            <div key={param.key}>
              <label className="text-[10px] text-navy-300 uppercase tracking-wider">{param.label}</label>
              <input
                value={values[param.key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [param.key]: e.target.value }))}
                placeholder={param.default ?? param.key}
                className="mt-1 w-full bg-navy-700 border border-navy-500 focus:border-ai-teal rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-navy-500"
              />
            </div>
          ))}
          {flow.params.length === 0 && (
            <p className="text-xs text-navy-300">Este flow não tem parâmetros.</p>
          )}
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs text-navy-300 hover:text-white border border-navy-600 rounded-lg">Cancelar</button>
          <button
            onClick={() => onRun(values)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-drupal-blue hover:bg-drupal-blue-light text-white rounded-lg"
          >
            <Play size={11} /> Executar
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  flows: Flow[]
  runningFlowId: string | null
  onEdit: (flow: Flow) => void
  onDelete: (id: string) => void
  onRun: (flow: Flow, params: Record<string, string>) => void
}

export function FlowList({ flows, runningFlowId, onEdit, onDelete, onRun }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [runningFlow, setRunningFlow] = useState<Flow | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(_expandedId)
  const [runsCache, setRunsCacheState] = useState<Record<string, FlowRun[]>>(() => ({ ..._cache }))
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null)
  const [pollTick, setPollTick] = useState(0)  // increments to re-trigger poll effect

  const setRunsCache = useCallback((updater: ((prev: Record<string, FlowRun[]>) => Record<string, FlowRun[]>) | Record<string, FlowRun[]>) => {
    setRunsCacheState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      // Sync to module-level cache so it survives remounts
      Object.keys(_cache).forEach(k => { if (!(k in next)) delete _cache[k] })
      Object.assign(_cache, next)
      return next
    })
  }, [])
  const setMainTab = useLayoutStore(s => s.setMainTab)

  const fetchRuns = useCallback(async (flowId: string) => {
    const runs = await getFlowRuns(flowId)
    setRunsCache(prev => {
      if (runs.length === 0 && (prev[flowId]?.length ?? 0) > 0) return prev
      return { ...prev, [flowId]: runs }
    })
    return runs
  }, [setRunsCache])

  // Reactive poll: fires whenever runsCache or pollTick changes.
  // When still running → setPollTick increments → effect re-runs → new setTimeout.
  // When done → fetchRuns updates runsCache (no 'running') → effect stops naturally.
  // Survives remounts: _cache restores 'running' entry → effect re-attaches automatically.
  useEffect(() => {
    const executingId = Object.keys(runsCache).find(id => runsCache[id]?.[0]?.status === 'running')
    if (!executingId) return
    const since = _triggerSince[executingId] ?? 0
    const timer = setTimeout(async () => {
      try {
        // Timeout: give up after POLL_TIMEOUT_MS — show error instead of spinning forever
        if (since > 0 && Date.now() - since > POLL_TIMEOUT_MS) {
          setRunsCache(prev => ({
            ...prev,
            [executingId]: [
              { id: 0, runAt: new Date().toISOString(), status: 'error', durationMs: 0, result: null, error: 'Timeout: sem resposta após 5 minutos.', scheduleType: 'once' },
              ...(prev[executingId] ?? []).filter(r => r.status !== 'running'),
            ],
          }))
          delete _triggerSince[executingId]
          return
        }
        const runs = await getFlowRuns(executingId)
        const newRun = runs.find(r => r.id > 0 && since > 0 && new Date(r.runAt).getTime() > since)
        if (newRun) {
          _consecutiveFails[executingId] = 0
          setRunsCache(prev => ({ ...prev, [executingId]: runs }))
          delete _triggerSince[executingId]
        } else if (since === 0 && runs.length > 0) {
          _consecutiveFails[executingId] = 0
          setRunsCache(prev => ({ ...prev, [executingId]: runs }))
        } else {
          // No new run yet — normal while flow is executing. Keep polling until timeout.
          setPollTick(t => t + 1)
        }
      } catch {
        // Only count consecutive API errors (exceptions), not "no new run yet"
        const fails = (_consecutiveFails[executingId] ?? 0) + 1
        _consecutiveFails[executingId] = fails
        if (fails >= MAX_CONSECUTIVE_FAILS && since > 0) {
          setRunsCache(prev => ({
            ...prev,
            [executingId]: [
              { id: 0, runAt: new Date().toISOString(), status: 'error', durationMs: 0, result: null, error: 'Erro ao ler histórico da BD. Verifica os logs do container.', scheduleType: 'once' },
              ...(prev[executingId] ?? []).filter(r => r.status !== 'running'),
            ],
          }))
          delete _triggerSince[executingId]
          delete _consecutiveFails[executingId]
        } else {
          setPollTick(t => t + 1)
        }
      }
    }, 6000)
    return () => clearTimeout(timer)
  }, [runsCache, setRunsCache, pollTick])

  const setExpanded = useCallback((id: string | null) => {
    _expandedId = id
    setExpandedId(id)
  }, [])

  // Auto-load history for all flows on mount (and when flows list changes).
  // Also refetches if the cached runs are missing results (stale cache from old code).
  useEffect(() => {
    flows.forEach(f => {
      const cached = _cache[f.id]
      const missingResults = cached && cached.length > 0 && cached.every(r => r.result === null && r.status !== 'running')
      if (!cached || missingResults) fetchRuns(f.id)
    })
  }, [flows, fetchRuns])

  const toggleHistory = useCallback(async (flowId: string) => {
    if (expandedId === flowId) { setExpanded(null); return }
    setExpanded(flowId)
    if (runsCache[flowId]) return
    setLoadingRuns(flowId)
    try { await fetchRuns(flowId) } finally { setLoadingRuns(null) }
  }, [expandedId, runsCache, fetchRuns])

  const handleRun = useCallback((flow: Flow) => {
    if (flow.params.length === 0) {
      triggerRun(flow, {})
    } else {
      setRunningFlow(flow)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerRun = useCallback((flow: Flow, params: Record<string, string>) => {
    onRun(flow, params)
    _triggerSince[flow.id] = Date.now()
    _consecutiveFails[flow.id] = 0
    // Open history and inject a fake 'running' entry — the useEffect poll takes it from here
    setExpanded(flow.id)
    setRunsCache(prev => ({
      ...prev,
      [flow.id]: [
        { id: 0, runAt: new Date().toISOString(), status: 'running', durationMs: 0, result: null, error: null, scheduleType: 'once' },
        ...(prev[flow.id] ?? []).filter(r => r.status !== 'running'),
      ],
    }))
  }, [onRun, setExpanded, setRunsCache])

  const handleSendToChat = useCallback(async (text: string) => {
    const store = useChatStore.getState()
    store.setAgentRunning(true)
    store.setStreaming(true)
    store.setStreamingStartedAt(Date.now())
    setMainTab('chat')
    try {
      await postMessage(text)
    } catch {
      store.setAgentRunning(false)
      store.setStreaming(false)
      store.setStreamingStartedAt(null)
    }
  }, [setMainTab])

  if (flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="w-12 h-12 rounded-xl bg-navy-700 border border-navy-500 flex items-center justify-center mb-3">
          <Zap size={20} className="text-navy-300" />
        </div>
        <p className="text-sm text-navy-300 font-medium">Sem flows</p>
        <p className="text-xs text-navy-500 mt-1 max-w-xs">Cria o teu primeiro flow para automatizar tarefas com skills e MCP tools.</p>
      </div>
    )
  }

  return (
    <>
      {runningFlow && (
        <RunModal
          flow={runningFlow}
          onRun={(params) => { triggerRun(runningFlow, params); setRunningFlow(null) }}
          onClose={() => setRunningFlow(null)}
        />
      )}

      <div className="space-y-3 p-4">
        {flows.map(flow => {
          const isTriggering = runningFlowId === flow.id
          const isDeleting = confirmDelete === flow.id
          const latestRun = runsCache[flow.id]?.[0]
          const isExecuting = latestRun?.status === 'running'
          const isBlocked = isTriggering || isExecuting

          return (
            <div key={flow.id} className={`bg-navy-800 border rounded-xl overflow-hidden transition-colors ${
              isExecuting ? 'border-ai-teal/40' : 'border-navy-600 hover:border-navy-500'
            }`}>
              {/* Header */}
              <div className="flex items-start justify-between px-4 pt-3 pb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{flow.name}</span>
                    {isExecuting && (
                      <div className="flex items-center gap-1 text-ai-teal">
                        <Loader2 size={11} className="animate-spin" />
                        <span className="text-[10px]">A executar</span>
                      </div>
                    )}
                    {isTriggering && !isExecuting && <Loader2 size={12} className="text-navy-300 animate-spin flex-shrink-0" />}
                  </div>
                  {flow.description && (
                    <p className="text-[11px] text-navy-300 mt-0.5 truncate">{flow.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button onClick={() => onEdit(flow)} className="p-1.5 text-navy-300 hover:text-white rounded transition-colors" title="Editar">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => isDeleting ? (onDelete(flow.id), setConfirmDelete(null)) : setConfirmDelete(flow.id)}
                    className={`p-1.5 rounded transition-colors ${isDeleting ? 'text-accent-red' : 'text-navy-300 hover:text-accent-red'}`}
                    title={isDeleting ? 'Clica de novo para confirmar' : 'Eliminar'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Pipeline preview */}
              <div className="px-4 pb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  <div className="flex items-center gap-1 bg-navy-700 border border-navy-600 rounded-md px-2 py-1 flex-shrink-0">
                    {flow.trigger === 'schedule'
                      ? <><Calendar size={9} className="text-ai-teal" /><span className="text-[9px] text-ai-teal">{flow.schedule?.label ?? 'Agendado'}</span></>
                      : <><Clock size={9} className="text-navy-300" /><span className="text-[9px] text-navy-300">Manual</span></>
                    }
                  </div>
                  {flow.steps.map((step) => (
                    <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
                      <ChevronRight size={10} className="text-navy-400" />
                      <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 border ${
                        step.type === 'skill' ? 'bg-ai-teal/10 border-ai-teal/30'
                        : step.type === 'mcp' ? 'bg-violet-500/10 border-violet-500/30'
                        : 'bg-drupal-blue/10 border-drupal-blue/30'
                      }`}>
                        {step.type === 'skill'
                          ? <Zap size={9} className="text-ai-teal" />
                          : step.type === 'mcp'
                            ? <Puzzle size={9} className="text-violet-400" />
                            : <MessageSquare size={9} className="text-drupal-blue-light" />
                        }
                        <span className="text-[9px] text-gray-300 max-w-[100px] truncate">
                          {step.type === 'skill'
                            ? (step.label ?? step.command?.replace('/skill:', '') ?? 'skill')
                            : step.type === 'mcp'
                              ? (step.mcpServer ?? 'mcp')
                              : (step.content?.slice(0, 20) + (step.content && step.content.length > 20 ? '…' : ''))
                          }
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-navy-700">
                <span className="text-[10px] text-navy-300">
                  {isDeleting
                    ? <span className="text-accent-red">Clica novamente para confirmar</span>
                    : <>{flow.lastRunAt ? `Último run ${fmtRelative(flow.lastRunAt)}` : 'Nunca executado'}{' · '}{flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}</>
                  }
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleHistory(flow.id)}
                    className="p-1.5 text-navy-300 hover:text-white rounded transition-colors"
                    title="Histórico de execuções"
                  >
                    {loadingRuns === flow.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : expandedId === flow.id
                        ? <ChevronDown size={11} />
                        : <History size={11} />
                    }
                  </button>
                  <button
                    onClick={() => handleRun(flow)}
                    disabled={isBlocked}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {isTriggering
                      ? <><Loader2 size={10} className="animate-spin" /> A enviar...</>
                      : isExecuting
                        ? <><Loader2 size={10} className="animate-spin" /> A executar...</>
                        : <><Play size={10} /> Run</>
                    }
                  </button>
                </div>
              </div>

              {/* Run history panel */}
              {expandedId === flow.id && (
                <div className="px-4 pb-3 border-t border-navy-600 bg-navy-700/30">
                  <p className="text-[9px] text-navy-300 uppercase tracking-wider pt-2 pb-1.5">Últimas execuções</p>
                  {runsCache[flow.id]?.length > 0
                    ? runsCache[flow.id].map((run, i) => (
                        <RunStatusBadge key={i} run={run} flowName={flow.name} onSendToChat={handleSendToChat} />
                      ))
                    : <p className="text-[10px] text-navy-300 py-1">Sem histórico disponível</p>
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
