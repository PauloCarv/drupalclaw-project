import { useState } from 'react'
import { ChevronDown, RefreshCw, X, Minus, Plus, Loader2 } from 'lucide-react'
import { useProviders } from '@/hooks/useProviders'
import { useSettingsStore } from '@/stores/settingsStore'
import { sendAgentMessage } from '@/api/providers'
import { OobeSetup } from '@/components/oobe/OobeSetup'

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

export function SettingsPanel() {
  const [showProvider, setShowProvider] = useState(false)
  const { fontSize, setFontSize, interactionMode, setInteractionMode, autoCompact, setAutoCompact, displayName, setDisplayName } = useSettingsStore()
  const { currentModelLabel, currentModel, modelOptions, switchModel, isSwitching } = useProviders()

  const [togglingAutoCompact, setTogglingAutoCompact] = useState(false)

  const handleAutoCompactToggle = async () => {
    if (togglingAutoCompact) return
    setTogglingAutoCompact(true)
    const next = !autoCompact
    try {
      await sendAgentMessage(`/auto-compact ${next ? 'on' : 'off'}`)
      setAutoCompact(next)
    } finally {
      setTogglingAutoCompact(false)
    }
  }

  const byProvider: Record<string, typeof modelOptions> = {}
  for (const opt of modelOptions) {
    ;(byProvider[opt.provider] ??= []).push(opt)
  }

  const handleModelChange = (label: string) => {
    if (label === currentModelLabel || isSwitching) return
    switchModel(label)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Provider dialog overlay — fixed so it covers the whole viewport */}
      {showProvider && (
        <div className="fixed inset-0 z-50 bg-navy-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg">
            <button
              onClick={() => setShowProvider(false)}
              className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-navy-600 border border-navy-500 flex items-center justify-center text-navy-300 hover:text-white hover:bg-navy-500 transition-colors"
            >
              <X size={14} />
            </button>
            <OobeSetup embedded reconfigure onComplete={() => setShowProvider(false)} />
          </div>
        </div>
      )}

      <div className="p-3 space-y-5">

        {/* ── Model & Provider ─────────────────────────── */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-navy-400 mb-2">Modelo</h4>

          {/* Current model card */}
          {currentModel ? (
            <div className="mb-2 p-2 rounded-lg bg-navy-600 border border-navy-500">
              <div className="text-[11px] font-semibold text-gray-200 truncate">{currentModel.name}</div>
              <div className="flex flex-wrap items-center gap-x-1.5 mt-0.5">
                <span className="text-[10px] text-navy-300">{currentModel.provider}</span>
                {currentModel.contextWindow && (
                  <>
                    <span className="text-navy-500">·</span>
                    <span className="text-[10px] text-navy-300">{fmt(currentModel.contextWindow)} ctx</span>
                  </>
                )}
                {currentModel.reasoning && (
                  <>
                    <span className="text-navy-500">·</span>
                    <span className="text-[10px] text-ai-teal">reasoning</span>
                  </>
                )}
              </div>
            </div>
          ) : modelOptions.length === 0 ? (
            <div className="mb-2 h-10 rounded-lg bg-navy-600 animate-pulse" />
          ) : null}

          {/* Model dropdown */}
          <div className="relative">
            <select
              value={currentModelLabel}
              disabled={isSwitching || modelOptions.length === 0}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full bg-navy-600 border border-navy-500 rounded px-2 py-1.5 text-[11px] text-gray-200 appearance-none pr-6 disabled:opacity-50 cursor-pointer"
            >
              {Object.entries(byProvider).map(([provider, opts]) => (
                <optgroup key={provider} label={provider}>
                  {opts.map((opt) => (
                    <option key={opt.label} value={opt.label}>
                      {opt.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-navy-400">
              {isSwitching
                ? <RefreshCw size={10} className="animate-spin" />
                : <ChevronDown size={10} />
              }
            </div>
          </div>

          <button
            onClick={() => setShowProvider(true)}
            className="mt-2 w-full text-[11px] text-navy-300 hover:text-ai-teal py-1.5 border border-navy-500 rounded transition-colors"
          >
            Mudar Provider
          </button>
        </section>

        {/* ── Identity ─────────────────────────────────── */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-navy-400 mb-2">Identidade</h4>
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-navy-300 block">Display name</span>
              <span className="text-[10px] text-navy-500 block leading-tight">Shown as initials in the chat. Leave empty to use "You".</span>
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              className="flex-shrink-0 w-28 bg-navy-600 border border-navy-500 rounded px-2 py-1 text-[11px] text-gray-200 placeholder-navy-500 focus:outline-none focus:border-drupal-blue"
            />
          </div>
        </section>

        {/* ── Agent behaviour ──────────────────────────── */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-navy-400 mb-2">Agente</h4>

          <div className="flex items-center justify-between py-1">
            <div className="flex-1 min-w-0 pr-2">
              <span className="text-[11px] text-navy-300 block">Interaction mode</span>
              <span className="text-[10px] text-navy-500 block leading-tight">Learning: agent explains steps. Expert: result only, no explanations.</span>
            </div>
            <div className="relative flex-shrink-0">
              <select
                value={interactionMode}
                onChange={(e) => setInteractionMode(e.target.value as 'learning' | 'expert')}
                className="bg-navy-600 border border-navy-500 rounded px-2 py-1 text-[11px] text-gray-200 appearance-none pr-5 cursor-pointer"
              >
                <option value="learning">Learning</option>
                <option value="expert">Expert</option>
              </select>
              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-navy-400" />
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex-1 min-w-0 pr-2">
              <span className="text-[11px] text-navy-300 block">Auto-compact</span>
              <span className="text-[10px] text-navy-500 block leading-tight">Automatically compacts when context is nearly full, before sending</span>
            </div>
            <button
              onClick={handleAutoCompactToggle}
              disabled={togglingAutoCompact}
              className="flex-shrink-0"
              title={autoCompact ? 'Disable auto-compact' : 'Enable auto-compact'}
            >
              {togglingAutoCompact ? (
                <Loader2 size={12} className="animate-spin text-navy-400" />
              ) : (
                <div className={`w-8 h-4 rounded-full transition-colors relative ${autoCompact ? 'bg-ai-teal' : 'bg-navy-500'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${autoCompact ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              )}
            </button>
          </div>
        </section>

        {/* ── Editor preferences ───────────────────────── */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-navy-400 mb-2">Editor / Terminal</h4>

          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-navy-300">Tamanho do texto</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                className="w-5 h-5 rounded bg-navy-600 border border-navy-500 flex items-center justify-center text-navy-300 hover:text-white hover:border-navy-400 transition-colors"
              >
                <Minus size={9} />
              </button>
              <span className="text-[11px] text-gray-200 w-6 text-center tabular-nums">{fontSize}</span>
              <button
                onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                className="w-5 h-5 rounded bg-navy-600 border border-navy-500 flex items-center justify-center text-navy-300 hover:text-white hover:border-navy-400 transition-colors"
              >
                <Plus size={9} />
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
