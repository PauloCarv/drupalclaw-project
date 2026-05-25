import { FolderTree, Zap, MessageSquare, Settings, Plus, Pencil, Trash2, Check, X, Archive, ArchiveRestore } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useLayoutStore, type SidebarSection } from '@/stores/layoutStore'
import { FileTree } from '@/components/files/FileTree'
import { SkillsList } from '@/components/skills/SkillsList'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { getAgentContext, getSystemMetrics } from '@/api/providers'
import { useSession } from '@/hooks/useSession'
import type { Session } from '@/api/sessions'

const sections: { id: SidebarSection; icon: typeof FolderTree; label: string }[] = [
  { id: 'explorer', icon: FolderTree, label: 'Explorer' },
  { id: 'skills', icon: Zap, label: 'Skills' },
  { id: 'chats', icon: MessageSquare, label: 'Chats' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarSection, setSidebarSection, sidebarWidth, setSidebarWidth } = useLayoutStore()
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setSidebarWidth(startWidth.current + ev.clientX - startX.current)
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth, setSidebarWidth])

  const renderContent = () => {
    switch (sidebarSection) {
      case 'explorer':
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <FileTree />
            </div>
            <div className="border-t border-navy-500 flex-shrink-0">
              <ContextStats />
            </div>
          </div>
        )
      case 'skills':
        return <SkillsList />
      case 'chats':
        return <ChatsList />
      case 'settings':
        return <SettingsPanel />
      default:
        return <FileTree />
    }
  }

  return (
    <aside className="flex-shrink-0 bg-navy-700 flex flex-col relative" style={{ width: sidebarWidth }}>
      {/* Section tabs */}
      <div className="flex border-b border-navy-500">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSidebarSection(s.id)}
            className={`flex-1 py-2 flex justify-center ${
              sidebarSection === s.id ? 'text-ai-teal border-b border-ai-teal' : 'text-navy-300 hover:text-gray-300'
            }`}
            title={s.label}
          >
            <s.icon size={16} />
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {renderContent()}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-ai-teal/40 transition-colors z-10"
      />
    </aside>
  )
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function Sparkline({ series, color, height = 24 }: { series: number[]; color: string; height?: number }) {
  if (!series || series.length < 2) return <div style={{ height }} />
  const max = Math.max(...series, 1)
  const w = 80
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w
    const y = height - (v / max) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={height} className="flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ArcGauge({ percent }: { percent: number }) {
  const r = 22
  const cx = 28
  const cy = 28
  const circ = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, percent))
  const dash = (pct / 100) * circ
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#2dd4bf'
  return (
    <svg width={56} height={56} className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#243049" strokeWidth="5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize="10" fontWeight="600">
        {pct.toFixed(0)}%
      </text>
    </svg>
  )
}

function ContextStats() {
  const { data: ctx } = useQuery({
    queryKey: ['agent-context'],
    queryFn: () => getAgentContext(),
    refetchInterval: 15000,
  })
  const { data: metrics } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => getSystemMetrics(),
    refetchInterval: 5000,
  })

  const percent = ctx?.percent ?? 0
  const tokens = ctx?.tokens ?? 0
  const ctxWindow = ctx?.contextWindow ?? 0
  const cpu = metrics?.cpu_percent ?? 0
  const ram = metrics?.ram_percent ?? 0
  const cpuColor = cpu > 80 ? '#ef4444' : '#2dd4bf'
  const ramColor = ram > 85 ? '#ef4444' : ram > 70 ? '#f59e0b' : '#0678be'

  return (
    <div className="p-2.5 space-y-2.5">
      {/* Context window */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-navy-400">Contexto</span>
        <div className="mt-1.5 flex items-center gap-2.5">
          <ArcGauge percent={percent} />
          <div className="min-w-0">
            {tokens > 0 ? (
              <>
                <div className="text-[11px] font-semibold text-gray-200">{fmt(tokens)}</div>
                <div className="text-[10px] text-navy-300">of {fmt(ctxWindow)} tokens</div>
                <div className={`mt-1 text-[10px] font-medium ${percent > 90 ? 'text-accent-red' : percent > 70 ? 'text-yellow-400' : 'text-ai-teal'}`}>
                  {percent > 90 ? 'Almost full' : percent > 70 ? 'High usage' : 'OK'}
                </div>
              </>
            ) : (
              <div className="text-[10px] text-navy-400">No data</div>
            )}
          </div>
        </div>
      </div>

      {/* System metrics */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-navy-400">System</span>
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-navy-300 w-6">CPU</span>
            <div className="flex-1 h-1 bg-navy-600 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cpu}%`, backgroundColor: cpuColor }} />
            </div>
            <span className="text-[10px] text-navy-300 w-7 text-right">{cpu.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-navy-300 w-6">RAM</span>
            <div className="flex-1 h-1 bg-navy-600 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ram}%`, backgroundColor: ramColor }} />
            </div>
            <span className="text-[10px] text-navy-300 w-7 text-right">{ram.toFixed(0)}%</span>
          </div>
          {/* Sparklines */}
          {metrics && (metrics.cpu_series?.length > 2 || metrics.ram_series?.length > 2) && (
            <div className="flex gap-1 pt-0.5">
              <Sparkline series={metrics.cpu_series} color={cpuColor} />
              <Sparkline series={metrics.ram_series} color={ramColor} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatsList() {
  const { sessions, activeSessionId, currentSession, createNewSession, switchSession, renameSession, archiveSession, unarchiveSession, deleteSessionById } = useSession()
  const { setSidebarSection } = useLayoutStore()
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const handleNew = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      await createNewSession()
      setSidebarSection('chats')
    } finally {
      setCreating(false)
    }
  }, [creating, createNewSession, setSidebarSection])

  const handleRenameStart = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(session.id)
    setRenameValue(session.name)
    setDeletingId(null)
  }

  const handleRenameSubmit = (id: string) => {
    const trimmed = renameValue.trim()
    if (trimmed) renameSession(id, trimmed)
    setRenamingId(null)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingId === id) {
      deleteSessionById(id)
      setDeletingId(null)
    } else {
      setDeletingId(id)
    }
  }

  const sorted = [...sessions].sort((a, b) => a.createdAt - b.createdAt)
  const active = sorted.filter((s) => !s.archived)
  const archived = sorted.filter((s) => s.archived)

  const renderSession = (session: Session) => {
    const isActive = session.id === activeSessionId
    const isCurrent = session.id === currentSession?.id
    const isRenaming = renamingId === session.id
    const isDeleting = deletingId === session.id

    if (isRenaming) {
      return (
        <div key={session.id} className="flex items-center gap-1 px-2 py-1.5 rounded bg-navy-600">
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit(session.id)
              if (e.key === 'Escape') setRenamingId(null)
            }}
            className="flex-1 min-w-0 bg-navy-700 text-white text-xs rounded px-1.5 py-0.5 outline-none border border-navy-400 focus:border-ai-teal"
          />
          <button onClick={() => handleRenameSubmit(session.id)} className="text-accent-green hover:text-white flex-shrink-0"><Check size={12} /></button>
          <button onClick={() => setRenamingId(null)} className="text-navy-300 hover:text-white flex-shrink-0"><X size={12} /></button>
        </div>
      )
    }

    return (
      <div
        key={session.id}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
          isActive ? 'bg-navy-600 text-white' : 'text-navy-300 hover:bg-navy-600 hover:text-gray-200'
        } ${session.archived ? 'opacity-60' : ''}`}
        onClick={() => switchSession(session.id)}
      >
        <span className="flex-1 min-w-0 truncate">{session.name}</span>
        {isCurrent && !session.archived && (
          <span className="w-1.5 h-1.5 rounded-full bg-ai-teal flex-shrink-0" title="New messages here" />
        )}
        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => handleRenameStart(session, e)}
            className="text-gray-400 hover:text-white p-0.5"
            title="Rename"
          >
            <Pencil size={11} />
          </button>
          {session.archived ? (
            <button
              onClick={(e) => { e.stopPropagation(); unarchiveSession(session.id) }}
              className="text-gray-400 hover:text-ai-teal p-0.5"
              title="Restore"
            >
              <ArchiveRestore size={11} />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); archiveSession(session.id) }}
              className="text-gray-400 hover:text-yellow-400 p-0.5"
              title="Archive"
            >
              <Archive size={11} />
            </button>
          )}
          {sessions.length > 1 && (
            <button
              onClick={(e) => handleDelete(session.id, e)}
              className={`p-0.5 ${isDeleting ? 'text-accent-red' : 'text-gray-400 hover:text-accent-red'}`}
              title={isDeleting ? 'Click again to confirm' : 'Delete'}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-navy-500">
        <h3 className="text-[10px] uppercase tracking-wider text-navy-400">Chats</h3>
        <button
          onClick={handleNew}
          disabled={creating}
          className="text-gray-400 hover:text-white disabled:opacity-40"
          title="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {active.map(renderSession)}

        {archived.length > 0 && (
          <>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-navy-400 hover:text-navy-300 transition-colors"
            >
              <Archive size={10} />
              <span>Archived ({archived.length})</span>
            </button>
            {showArchived && archived.map(renderSession)}
          </>
        )}
      </div>

      {creating && (
        <div className="px-3 py-2 text-[10px] text-navy-400 border-t border-navy-500">
          Creating new conversation...
        </div>
      )}
    </div>
  )
}

