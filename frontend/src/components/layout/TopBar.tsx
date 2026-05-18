import { useState, useRef, useEffect } from 'react'
import { PanelLeft, PanelRight, Terminal, ChevronDown, Check, Loader2 } from 'lucide-react'
import { useLayoutStore } from '@/stores/layoutStore'
import { useProviders } from '@/hooks/useProviders'
import type { ModelOption } from '@/api/providers'

export function TopBar() {
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const toggleContextPanel = useLayoutStore((s) => s.toggleContextPanel)
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel)
  const { currentModel, currentModelLabel, modelOptions, switchModel, isSwitching } = useProviders()

  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSwitch = (model: ModelOption) => {
    if (model.label === currentModelLabel) { setOpen(false); return }
    switchModel(model.label)
    setOpen(false)
  }

  const providerName = currentModel?.provider
    ? currentModel.provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'AI'
  const modelName = currentModel?.name || currentModelLabel.split('/').pop() || 'Model'

  // Group models by provider
  const grouped = modelOptions.reduce<Record<string, ModelOption[]>>((acc, m) => {
    const p = m.provider || 'other'
    if (!acc[p]) acc[p] = []
    acc[p].push(m)
    return acc
  }, {})

  function fmtCtx(n: number | null) {
    if (!n) return null
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M ctx`
    if (n >= 1_000) return `${Math.round(n / 1_000)}K ctx`
    return `${n} ctx`
  }

  return (
    <header className="h-10 flex items-center justify-between px-3 bg-navy-800 border-b border-navy-500 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="btn-ghost p-1.5">
          <PanelLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-drupal-blue flex items-center justify-center text-[11px] font-bold text-white">
            DC
          </div>
          <span className="text-sm font-semibold text-drupal-blue-light">DrupalClaw</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Model switcher */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={isSwitching}
            className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-500 border border-navy-500 rounded-full px-2.5 py-1 transition-colors"
          >
            {isSwitching
              ? <Loader2 size={10} className="animate-spin text-ai-teal" />
              : <div className="w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0" />
            }
            <span className="text-[11px] text-navy-300 hidden sm:inline">{providerName}</span>
            <span className="text-[11px] text-accent-green font-medium">{modelName}</span>
            <ChevronDown size={11} className={`text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-navy-700 border border-navy-500 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-navy-600">
                <span className="text-[10px] uppercase tracking-wider text-navy-400">Seleccionar modelo</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {Object.entries(grouped).map(([provider, models]) => (
                  <div key={provider}>
                    <div className="px-3 py-1.5 bg-navy-800/50">
                      <span className="text-[10px] uppercase tracking-wider text-navy-400">
                        {provider.replace(/-/g, ' ')}
                      </span>
                    </div>
                    {models.map((m) => {
                      const active = m.label === currentModelLabel
                      return (
                        <button
                          key={m.label}
                          onClick={() => handleSwitch(m)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                            active ? 'bg-navy-600' : 'hover:bg-navy-600'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-medium truncate ${active ? 'text-ai-teal' : 'text-gray-200'}`}>
                                {m.name}
                              </span>
                              {m.reasoning && (
                                <span className="text-[9px] bg-drupal-blue/30 text-drupal-blue-light px-1 rounded flex-shrink-0">
                                  reasoning
                                </span>
                              )}
                            </div>
                            {m.contextWindow && (
                              <span className="text-[10px] text-navy-400">{fmtCtx(m.contextWindow)}</span>
                            )}
                          </div>
                          {active && <Check size={13} className="text-ai-teal flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Terminal toggle */}
        <button onClick={toggleBottomPanel} className="btn-ghost p-1.5" title="Terminal">
          <Terminal size={14} />
        </button>

        {/* Context panel toggle */}
        <button onClick={toggleContextPanel} className="btn-ghost p-1.5" title="Painel de contexto">
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  )
}
