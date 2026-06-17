import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Zap, DollarSign, BarChart2, Leaf, Clock, ChevronDown, ChevronRight, TreeDeciduous, Wind, Droplets, Layers, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useUsage } from '@/hooks/useUsage'
import { useUsageStore } from '@/stores/usageStore'
import {
  computeEnvironmentalImpact,
  fmtTokens, fmtCost, fmtGrams, fmtMl,
  type UsageTotals, type TurnStats,
} from '@/api/usage'

function fmtTrees(days: number): string {
  if (days < 1) return `1 tree for ${(days * 24).toFixed(1)} hours`
  return `1 tree for ${days.toFixed(0)} days`
}

// ── Helpers ─────────────────────────────────────────────────────

function fmtRate(r: number) {
  return `${r.toFixed(1)}%`
}

function fmtRelative(iso: string): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function cacheHitColor(rate: number): string {
  if (rate >= 90) return 'text-accent-green'
  if (rate >= 70) return 'text-ai-teal'
  if (rate >= 40) return 'text-yellow-400'
  return 'text-accent-red'
}

// ── Sub-components ───────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="bg-navy-700 border border-navy-500 rounded-lg p-3 flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-navy-400">{label}</span>
      <span className={`text-xl font-bold font-mono leading-tight ${accent ?? 'text-gray-100'}`}>{value}</span>
      {sub && <span className="text-[10px] text-navy-400 leading-tight">{sub}</span>}
    </div>
  )
}

function TokenBar({ totals }: { totals: UsageTotals }) {
  const total = totals.totalTokens || 1
  const reads = totals.cacheReadTokens
  const writes = totals.cacheWriteTokens
  const output = totals.outputTokens
  const input = totals.inputTokens

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`
  const w = (n: number) => `${Math.max(0.2, (n / total) * 100)}%`

  const segments = [
    { label: 'Cache Reads', tokens: reads, color: 'bg-ai-teal', textColor: 'text-ai-teal' },
    { label: 'Cache Writes', tokens: writes, color: 'bg-drupal-blue', textColor: 'text-drupal-blue-light' },
    { label: 'Output', tokens: output, color: 'bg-amber-500', textColor: 'text-amber-400' },
    { label: 'Fresh Input', tokens: input, color: 'bg-navy-400', textColor: 'text-navy-300' },
  ]

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-5 rounded overflow-hidden gap-px">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} opacity-90 transition-all`}
            style={{ width: w(s.tokens) }}
            title={`${s.label}: ${fmtTokens(s.tokens)} (${pct(s.tokens)})`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-sm ${s.color} opacity-90`} />
              <span className="text-[10px] text-navy-300">{s.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-mono ${s.textColor}`}>{fmtTokens(s.tokens)}</span>
              <span className="text-[10px] text-navy-500">({pct(s.tokens)})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TurnRow({ turn, index }: { turn: TurnStats; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-navy-600 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-navy-600/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={11} className="text-navy-400" /> : <ChevronRight size={11} className="text-navy-400" />}
          <span className="text-[11px] text-navy-300">Turn {index + 1}</span>
          <span className={`text-[10px] font-mono font-semibold ${cacheHitColor(turn.cacheHitRate)}`}>
            {fmtRate(turn.cacheHitRate)} cache
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-gray-300">{fmtTokens(turn.totalTokens)}</span>
          <span className="text-[10px] text-navy-400">{fmtRelative(turn.runAt)}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-navy-600 bg-navy-800/60 space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
            <span className="text-navy-400">Model: <span className="text-gray-300 font-mono">{turn.model || '—'}</span></span>
            <span className="text-navy-400">Provider: <span className="text-gray-300">{turn.provider || '—'}</span></span>
            <span className="text-navy-400">Cost: <span className="text-amber-400 font-mono">{fmtCost(turn.costTotal)}</span></span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] mt-1">
            <span className="text-navy-400">Cache Reads: <span className="text-ai-teal font-mono">{fmtTokens(turn.cacheReadTokens)}</span></span>
            <span className="text-navy-400">Cache Writes: <span className="text-drupal-blue-light font-mono">{fmtTokens(turn.cacheWriteTokens)}</span></span>
            <span className="text-navy-400">Output: <span className="text-amber-400 font-mono">{fmtTokens(turn.outputTokens)}</span></span>
            <span className="text-navy-400">Fresh Input: <span className="text-navy-300 font-mono">{fmtTokens(turn.inputTokens)}</span></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Provider/Model breakdown ─────────────────────────────────────

interface ProviderGroup {
  key: string
  provider: string
  model: string
  turnCount: number
  totalTokens: number
  totalCost: number
  avgCacheHitRate: number
}

function computeProviderGroups(turns: TurnStats[]): ProviderGroup[] {
  const map = new Map<string, ProviderGroup>()
  for (const turn of turns) {
    const provider = turn.provider || 'unknown'
    const model = turn.model || 'unknown'
    const key = `${provider}/${model}`
    if (!map.has(key)) {
      map.set(key, { key, provider, model, turnCount: 0, totalTokens: 0, totalCost: 0, avgCacheHitRate: 0 })
    }
    const g = map.get(key)!
    g.turnCount++
    g.totalTokens += turn.totalTokens
    g.totalCost += turn.costTotal
    g.avgCacheHitRate += turn.cacheHitRate
  }
  for (const g of map.values()) {
    g.avgCacheHitRate = g.turnCount > 0 ? g.avgCacheHitRate / g.turnCount : 0
  }
  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens)
}

// ── Main panel ───────────────────────────────────────────────────

export function UsagePanel() {
  const { data, isLoading, lastUpdated } = useUsage()
  const turns = useUsageStore((s) => s.turns)
  const clearTurns = useUsageStore((s) => s.clearTurns)
  const queryClient = useQueryClient()
  const providerGroups = computeProviderGroups(turns)

  const { totals, latest } = data

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['usage-data'] })
  }

  if (isLoading && !totals) {
    return (
      <div className="h-full flex items-center justify-center text-navy-400 text-sm">
        <RefreshCw size={14} className="animate-spin mr-2" />
        Loading usage data…
      </div>
    )
  }

  if (!totals) {
    return (
      <div className="h-full flex items-center justify-center text-navy-400 text-sm">
        No usage data available yet. Start a conversation to begin tracking.
      </div>
    )
  }

  const env = computeEnvironmentalImpact(totals)
  const lastUpdatedStr = lastUpdated
    ? fmtRelative(new Date(lastUpdated).toISOString())
    : '—'

  return (
    <div className="h-full overflow-y-auto bg-navy-900">
      <div className="max-w-4xl mx-auto p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Usage & Performance</h2>
            <p className="text-[10px] text-navy-400 mt-0.5">
              Session totals since container start · refreshes every 30s
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-navy-300 hover:text-ai-teal border border-navy-500 hover:border-ai-teal/40 rounded transition-colors"
            title="Refresh now"
          >
            <RefreshCw size={10} />
            Updated {lastUpdatedStr}
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Tokens"
            value={fmtTokens(totals.totalTokens)}
            sub={`${fmtTokens(totals.inputTokens + totals.outputTokens)} fresh · ${fmtTokens(totals.cacheReadTokens)} cached`}
          />
          <StatCard
            label="Session Cost"
            value={fmtCost(totals.costTotal)}
            sub="as reported by PiClaw"
            accent="text-amber-400"
          />
          <StatCard
            label="Agent Turns"
            value={String(totals.runs)}
            sub="since container start"
          />
          <StatCard
            label="Cache Hit Rate"
            value={fmtRate(totals.cacheHitRate)}
            sub="of tokens served from cache"
            accent={cacheHitColor(totals.cacheHitRate)}
          />
        </div>

        {/* Token breakdown */}
        <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={13} className="text-navy-400" />
            <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">Token Breakdown — Session</span>
          </div>
          <TokenBar totals={totals} />
        </div>

        {/* Last turn */}
        {latest && (
          <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-navy-400" />
                <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">Last Turn</span>
              </div>
              <span className="text-[10px] text-navy-400">{fmtRelative(latest.runAt)}</span>
            </div>

            {/* Model badge */}
            <div className="flex flex-wrap gap-2">
              {latest.model && (
                <span className="px-2 py-0.5 rounded bg-navy-700 border border-navy-500 text-[10px] text-gray-300 font-mono">
                  {latest.model}
                </span>
              )}
              {latest.provider && (
                <span className="px-2 py-0.5 rounded bg-navy-700 border border-navy-500 text-[10px] text-navy-300">
                  {latest.provider}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded bg-navy-700 border border-navy-500 text-[10px] font-semibold ${cacheHitColor(latest.cacheHitRate)}`}>
                {fmtRate(latest.cacheHitRate)} cache hit
              </span>
            </div>

            {/* Last turn token bar */}
            <TokenBar totals={{
              ...totals,
              inputTokens: latest.inputTokens,
              outputTokens: latest.outputTokens,
              cacheReadTokens: latest.cacheReadTokens,
              cacheWriteTokens: latest.cacheWriteTokens,
              totalTokens: latest.totalTokens,
              costTotal: latest.costTotal,
              cacheHitRate: latest.cacheHitRate,
              runs: 1,
            }} />

            <div className="flex items-center gap-4 pt-1 border-t border-navy-600">
              <span className="text-[10px] text-navy-400">
                Cost: <span className="text-amber-400 font-mono">{fmtCost(latest.costTotal)}</span>
              </span>
              <span className="text-[10px] text-navy-400">
                Total: <span className="text-gray-300 font-mono">{fmtTokens(latest.totalTokens)}</span>
              </span>
            </div>
          </div>
        )}

        {/* Two-column: Cache savings + Environmental impact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Cache savings */}
          <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-ai-teal" />
              <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">Cache Efficiency</span>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-navy-400">Cached</span>
                  <span className="text-ai-teal font-mono">{fmtTokens(totals.cacheReadTokens)}</span>
                </div>
                <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ai-teal rounded-full"
                    style={{ width: `${Math.min(100, totals.cacheHitRate)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-navy-400">Fresh compute</span>
                  <span className="text-navy-300 font-mono">{fmtTokens(env.freshTokens)}</span>
                </div>
                <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-navy-500 rounded-full"
                    style={{ width: `${Math.min(100, 100 - totals.cacheHitRate)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-navy-600 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-navy-400">Without cache</span>
                <span className="text-navy-300 font-mono">{fmtTokens(env.freshWithoutCache)} tokens</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-navy-400">Tokens avoided</span>
                <span className="text-ai-teal font-mono">↓ {fmtTokens(env.freshWithoutCache - env.freshTokens)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-navy-400">Reduction</span>
                <span className="text-ai-teal font-mono">
                  {((1 - env.freshTokens / env.freshWithoutCache) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Environmental impact */}
          <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Leaf size={13} className="text-accent-green" />
              <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">Environmental Impact</span>
              <span className="text-[9px] text-navy-500 ml-auto">estimated</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-navy-400 flex items-center gap-1">
                  <Wind size={10} className="text-navy-400" />
                  CO₂ this session
                </span>
                <span className="text-gray-300 font-mono">{fmtGrams(env.co2ActualG)}</span>
              </div>
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-navy-400 flex items-center gap-1">
                  <Wind size={10} className="text-accent-green" />
                  CO₂ avoided by cache
                </span>
                <span className="text-accent-green font-mono font-semibold">↓ {fmtGrams(env.co2SavedG)}</span>
              </div>
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-navy-400 flex items-center gap-1">
                  <Droplets size={10} className="text-navy-400" />
                  Water used (cooling)
                </span>
                <span className="text-gray-300 font-mono">{fmtMl(env.waterActualMl)}</span>
              </div>
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-navy-400 flex items-center gap-1">
                  <Droplets size={10} className="text-accent-green" />
                  Water saved by cache
                </span>
                <span className="text-accent-green font-mono">↓ {fmtMl(env.waterSavedMl)}</span>
              </div>
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-navy-400 flex items-center gap-1">
                  <TreeDeciduous size={10} className="text-accent-green" />
                  Cache CO₂ saving ≡
                </span>
                <span className="text-accent-green font-mono">≈ {fmtTrees(env.treeDaysSaved)}</span>
              </div>
            </div>

            <p className="text-[9px] text-navy-500 leading-relaxed pt-1 border-t border-navy-600">
              ~0.005 kWh/1k tokens · 0.233 kg CO₂/kWh (EU avg) · 1.8 L/kWh cooling.
              Tree: 1 mature tree ≈ 21 kg CO₂/year. Only fresh compute counted — cache reads bypass GPU.
              Actual impact varies by provider infrastructure and region.
            </p>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign size={13} className="text-amber-400" />
            <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">Cost Breakdown</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total cost', value: fmtCost(totals.costTotal), accent: 'text-amber-400' },
              { label: 'Per turn avg', value: totals.runs > 0 ? fmtCost(totals.costTotal / totals.runs) : '—', accent: 'text-amber-300' },
              { label: 'Per 1K tokens', value: totals.totalTokens > 0 ? fmtCost((totals.costTotal / totals.totalTokens) * 1000) : '—', accent: 'text-navy-300' },
              { label: 'Last turn', value: latest ? fmtCost(latest.costTotal) : '—', accent: 'text-navy-300' },
            ].map(({ label, value, accent }) => (
              <div key={label} className="bg-navy-700 rounded p-2.5">
                <span className="text-[9px] uppercase tracking-wide text-navy-400 block">{label}</span>
                <span className={`text-base font-bold font-mono ${accent}`}>{value}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-navy-500">
            Cost as reported by PiClaw — reflects actual provider billing (e.g. GitHub Copilot subscription: $0 marginal).
            Figures are informational.
          </p>
        </div>

        {/* By provider / model */}
        {providerGroups.length > 0 && (
          <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Layers size={13} className="text-drupal-blue-light" />
              <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">By Provider / Model</span>
              <span className="text-[10px] text-navy-500">accumulated across refreshes</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-navy-400 text-[9px] uppercase tracking-wider border-b border-navy-600">
                    <th className="text-left pb-1.5 pr-3 font-medium">Provider / Model</th>
                    <th className="text-right pb-1.5 px-3 font-medium">Turns</th>
                    <th className="text-right pb-1.5 px-3 font-medium">Tokens</th>
                    <th className="text-right pb-1.5 px-3 font-medium">Avg Cache</th>
                    <th className="text-right pb-1.5 pl-3 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700">
                  {providerGroups.map((g) => (
                    <tr key={g.key} className="hover:bg-navy-700/30 transition-colors">
                      <td className="py-1.5 pr-3">
                        <div className="font-mono text-gray-300 truncate max-w-[140px]" title={g.model}>{g.model}</div>
                        <div className="text-[9px] text-navy-400">{g.provider}</div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-navy-300">{g.turnCount}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-gray-300">{fmtTokens(g.totalTokens)}</td>
                      <td className={`py-1.5 px-3 text-right font-mono font-semibold ${cacheHitColor(g.avgCacheHitRate)}`}>
                        {fmtRate(g.avgCacheHitRate)}
                      </td>
                      <td className="py-1.5 pl-3 text-right font-mono text-amber-400">{fmtCost(g.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Turn history */}
        {turns.length > 0 && (
          <div className="bg-navy-800 border border-navy-500 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-navy-400" />
                <span className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold">
                  Turn History
                </span>
                <span className="text-[10px] text-navy-500">persists across refreshes · {turns.length} turns</span>
              </div>
              <button
                onClick={clearTurns}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-navy-400 hover:text-accent-red border border-navy-600 hover:border-accent-red/40 rounded transition-colors"
                title="Clear turn history"
              >
                <Trash2 size={9} />
                Clear
              </button>
            </div>
            <div className="space-y-1.5">
              {turns.map((turn, i) => (
                <TurnRow key={turn.runAt + i} turn={turn} index={i} />
              ))}
            </div>
            <p className="text-[9px] text-navy-500">Saved to localStorage · survives page refresh · max 50 turns.</p>
          </div>
        )}

      </div>
    </div>
  )
}
