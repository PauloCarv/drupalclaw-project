import { FolderTree, Zap, MessageSquare, Settings, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLayoutStore, type SidebarSection } from '@/stores/layoutStore'
import { FileTree } from '@/components/files/FileTree'
import { SkillsList } from '@/components/skills/SkillsList'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { getAgentContext, getSystemMetrics } from '@/api/providers'

const sections: { id: SidebarSection; icon: typeof FolderTree; label: string }[] = [
  { id: 'explorer', icon: FolderTree, label: 'Explorer' },
  { id: 'skills', icon: Zap, label: 'Skills' },
  { id: 'chats', icon: MessageSquare, label: 'Chats' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarSection, setSidebarSection } = useLayoutStore()

  const renderContent = () => {
    switch (sidebarSection) {
      case 'explorer':
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
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
    <aside className="w-56 flex-shrink-0 bg-navy-700 border-r border-navy-500 flex flex-col">
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
                <div className="text-[10px] text-navy-300">de {fmt(ctxWindow)} tokens</div>
                <div className={`mt-1 text-[10px] font-medium ${percent > 90 ? 'text-accent-red' : percent > 70 ? 'text-yellow-400' : 'text-ai-teal'}`}>
                  {percent > 90 ? 'Contexto quase cheio' : percent > 70 ? 'Contexto elevado' : 'Contexto OK'}
                </div>
              </>
            ) : (
              <div className="text-[10px] text-navy-400">Sem dados</div>
            )}
          </div>
        </div>
      </div>

      {/* System metrics */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-navy-400">Sistema</span>
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
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wider text-navy-300">Chat sessions</h3>
        <button className="text-navy-300 hover:text-ai-teal">
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-1">
        <div className="sidebar-item sidebar-item-active">Module dev</div>
        <div className="sidebar-item">Theme setup</div>
        <div className="sidebar-item">Deploy config</div>
      </div>
    </div>
  )
}

