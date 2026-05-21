import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { MessageSquare, Cpu, BookOpen, ExternalLink, Loader2, Minimize2, Activity } from 'lucide-react'
import { useProviders } from '@/hooks/useProviders'
import { getAgentContext, sendAgentMessage } from '@/api/providers'
import type { TimelinePost } from '@/api/chat'
import { readFile } from '@/api/files'
import { useLayoutStore } from '@/stores/layoutStore'
import { useEditorStore } from '@/stores/editorStore'
import { useChatStore } from '@/stores/chatStore'
import { useSession } from '@/hooks/useSession'

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function fmtRelative(ts: number, now: number): string {
  const diff = Math.floor((now - ts) / 1000)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function fmtCtx(n: number | null) {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M tokens`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K tokens`
  return `${n} tokens`
}

function Section({ icon: Icon, title, children }: { icon: typeof MessageSquare; title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-3 border-t border-navy-500">
      <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-navy-600">
        <Icon size={11} className="text-navy-400" />
        <span className="text-[10px] uppercase tracking-wider text-navy-300 font-semibold">{title}</span>
      </div>
      <div className="space-y-1.5 pl-0.5">{children}</div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-navy-400 flex-shrink-0">{label}</span>
      <span className={`text-[11px] truncate ${accent ? 'text-ai-teal font-medium' : 'text-gray-300'}`}>{value}</span>
    </div>
  )
}

export function ContextPanel() {
  const { currentModel, currentModelLabel } = useProviders()
  const setMainTab = useLayoutStore((s) => s.setMainTab)
  const { openFile, setFileContent } = useEditorStore()

  const openAgentsMd = async () => {
    const path = 'AGENTS.md'
    openFile(path, 'AGENTS.md')
    setMainTab('editor')
    try {
      const content = await readFile(path)
      setFileContent(path, content)
    } catch {
      setFileContent(path, '// Error loading AGENTS.md')
    }
  }

  const queryClient = useQueryClient()
  const { activeSession, getSessionBounds } = useSession()

  const { data: ctx } = useQuery({
    queryKey: ['agent-context'],
    queryFn: () => getAgentContext(),
    refetchInterval: 15000,
  })

  // Read from the shared timeline cache populated by useChat — no separate fetch
  const timeline = queryClient.getQueryData<TimelinePost[]>(['timeline']) ?? []

  const percent = ctx?.percent ?? 0
  const tokens = ctx?.tokens ?? 0
  const ctxWindow = ctx?.contextWindow ?? 0

  // Force a re-render when the timeline cache updates
  useQuery({ queryKey: ['timeline'], enabled: false })

  const TIMELINE_LIMIT = 100
  const sessionBounds = activeSession ? getSessionBounds(activeSession) : null
  const sessionMessages = sessionBounds
    ? timeline.filter((p) => {
        const id = Number(p.id ?? p.rowid ?? 0)
        if (id < sessionBounds.start) return false
        if (sessionBounds.end !== undefined && id >= sessionBounds.end) return false
        return true
      })
    : timeline
  const msgCount = sessionMessages.length
  const hasMore = sessionBounds
    ? timeline.filter((p) => Number(p.id ?? p.rowid ?? 0) < sessionBounds.start).length > 0
    : timeline.length >= TIMELINE_LIMIT
  const sessionStart = activeSession
    ? new Date(activeSession.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
  const sessionName = activeSession?.name ?? 'web:default'

  const providerName = currentModel?.provider
    ? currentModel.provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : currentModelLabel.split('/')[0] || '—'
  const modelName = currentModel?.name || currentModelLabel.split('/').pop() || '—'
  const modelCtxWindow = currentModel?.contextWindow ?? null

  const ctxColor = percent > 100 ? 'text-accent-red' : percent > 90 ? 'text-accent-red' : percent > 70 ? 'text-yellow-400' : 'text-ai-teal'
  const ctxLabel = percent > 100 ? 'Exceeded' : percent > 90 ? 'Almost full' : percent > 70 ? 'High' : tokens > 0 ? 'Normal' : '—'
  const showCompact = percent > 70

  const { isStreaming, isAgentRunning, streamingStartedAt } = useChatStore()

  // Tick every 1s while agent is running, 30s when idle — drives elapsed + relative time
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), isAgentRunning ? 1000 : 30000)
    return () => clearInterval(id)
  }, [isAgentRunning])

  const elapsed = isAgentRunning && streamingStartedAt
    ? Math.floor((now - streamingStartedAt) / 1000)
    : 0

  const lastAssistantTs = timeline.reduce<number | null>((latest, p) => {
    if (p.data?.type !== 'agent_response') return latest
    const ts = p.timestamp ? new Date(p.timestamp).getTime() : 0
    return latest === null || ts > latest ? ts : latest
  }, null)

  const [compacting, setCompacting] = useState(false)
  const handleCompact = async () => {
    setCompacting(true)
    try {
      await sendAgentMessage('/compact')
      setMainTab('chat')
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['agent-context'] }), 3000)
    } finally {
      setCompacting(false)
    }
  }

  return (
    <aside className="w-52 flex-shrink-0 bg-navy-700 border-l border-navy-500 flex flex-col overflow-y-auto">
      <div className="px-3 pt-3 pb-2 border-b border-navy-500">
        <span className="text-[11px] uppercase tracking-wider text-gray-300 font-semibold">Agent</span>
      </div>

      {/* Session */}
      <Section icon={MessageSquare} title="Session">
        <Row label="Chat" value={sessionName} />
        <Row label="Messages" value={msgCount > 0 ? `${msgCount}${hasMore ? '+' : ''}` : '—'} />
        <Row label="Start" value={sessionStart} />
        {tokens > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-navy-600">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-navy-400">Context used</span>
              <span className={`text-[11px] font-semibold ${ctxColor}`}>{percent.toFixed(0)}% — {ctxLabel}</span>
            </div>
            <div className="mt-1 h-1 bg-navy-600 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: percent > 90 ? '#ef4444' : percent > 70 ? '#f59e0b' : '#2dd4bf' }}
              />
            </div>
            <div className="mt-0.5 text-[9px] text-navy-500 italic">global agent context</div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] text-navy-400">{fmt(tokens)}</span>
              <span className="text-[9px] text-navy-400">{fmt(ctxWindow)}</span>
            </div>
            {showCompact && (
              <button
                onClick={handleCompact}
                disabled={compacting}
                className={`mt-2 w-full flex items-center justify-center gap-1.5 py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-50 ${
                  percent > 90
                    ? 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/30'
                    : 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 border border-yellow-400/20'
                }`}
                title="Sends /compact to the agent — summarises history and frees context space"
              >
                {compacting
                  ? <Loader2 size={10} className="animate-spin" />
                  : <Minimize2 size={10} />
                }
                {compacting ? 'Compacting...' : 'Compact context'}
              </button>
            )}
          </div>
        )}
      </Section>

      {/* Model */}
      <Section icon={Cpu} title="Model">
        <Row label="Provider" value={providerName} />
        <Row label="Model" value={modelName} accent />
        {modelCtxWindow && <Row label="Context" value={fmtCtx(modelCtxWindow)} />}
        {currentModel?.reasoning && (
          <div className="mt-1">
            <span className="text-[9px] bg-drupal-blue/30 text-drupal-blue-light px-1.5 py-0.5 rounded">
              reasoning active
            </span>
          </div>
        )}
      </Section>

      {/* System prompt */}
      <Section icon={BookOpen} title="Instructions">
        <div className="text-[10px] text-navy-300 leading-relaxed">
          System: <span className="text-gray-300">AGENTS.md</span>
        </div>
        <button
          onClick={openAgentsMd}
          className="mt-1 flex items-center gap-1 text-[10px] text-drupal-blue-light hover:text-ai-teal transition-colors"
        >
          <ExternalLink size={9} />
          <span>View instructions</span>
        </button>
      </Section>

      {/* Activity */}
      <Section icon={Activity} title="Activity">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-navy-400">Status</span>
          <div className="flex items-center gap-1.5">
            {isAgentRunning ? (
              <>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isStreaming ? 'bg-drupal-blue' : 'bg-ai-teal'}`} />
                <span className="text-[11px] text-ai-teal font-medium">
                  {isStreaming ? 'Generating' : 'Processing'}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-navy-400" />
                <span className="text-[11px] text-gray-300">Idle</span>
              </>
            )}
          </div>
        </div>
        {isAgentRunning && elapsed > 0 && (
          <Row label="Running" value={fmtElapsed(elapsed)} />
        )}
        {lastAssistantTs && (
          <Row label="Last response" value={fmtRelative(lastAssistantTs, now)} />
        )}
      </Section>
    </aside>
  )
}
