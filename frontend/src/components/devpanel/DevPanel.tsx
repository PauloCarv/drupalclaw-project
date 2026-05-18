import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useLayoutStore } from '@/stores/layoutStore'

interface DevPanelButton {
  label: string
  command: string
  hint: string
}

interface DevPanelGroup {
  label: string
  buttons: DevPanelButton[]
}

interface DevPanelConfig {
  title: string
  subtitle: string
  groups: DevPanelGroup[]
}

const FALLBACK_CONFIG: DevPanelConfig = {
  title: 'Drupal Dev Panel',
  subtitle: 'Atalhos para desenvolvimento Drupal.',
  groups: [
    {
      label: 'Stack',
      buttons: [
        { label: 'Start Stack', command: 'drupal-serve', hint: 'Inicia PHP + nginx + BD' },
        { label: 'Stop', command: 'drupal-stack stop', hint: 'Para containers' },
        { label: 'Restart', command: 'drupal-stack restart', hint: 'Reinicia containers' },
        { label: 'Status', command: 'drupal-stack status', hint: 'Estado dos containers' },
      ],
    },
    {
      label: 'Projecto',
      buttons: [
        { label: 'Init', command: 'drupal-init', hint: 'Cria projecto via Composer' },
        { label: 'Cache Rebuild', command: 'drupal-cr', hint: 'Limpa caches' },
        { label: 'Status', command: 'drupal-status', hint: 'Estado do projecto' },
      ],
    },
    {
      label: 'Codigo',
      buttons: [
        { label: 'New Module', command: 'drupal-module', hint: 'Scaffolda modulo custom' },
        { label: 'Analyze', command: 'drupal-analyze', hint: 'PHPStan + PHPCS' },
        { label: 'Fix', command: 'drupal-fix', hint: 'Corrige erros' },
        { label: 'Install Module', command: 'drupal-install', hint: 'Instala modulo contrib' },
      ],
    },
    {
      label: 'Base de Dados',
      buttons: [
        { label: 'DB Export', command: 'drupal-db-export', hint: 'Exporta DB' },
        { label: 'DB Import', command: 'drupal-db-import', hint: 'Importa DB' },
        { label: 'DB Query', command: 'drupal-db-query', hint: 'Executa query SQL' },
      ],
    },
    {
      label: 'Diagnostico',
      buttons: [
        { label: 'Logs', command: 'drupal-logs', hint: 'Watchdog logs' },
        { label: 'Debug', command: 'drupal-debug', hint: 'Diagnostica erros' },
        { label: 'Performance', command: 'drupal-perf', hint: 'Analisa performance' },
      ],
    },
  ],
}

async function loadDevPanelConfig(): Promise<DevPanelConfig> {
  try {
    const res = await fetch('/workspace/file?path=.piclaw/dev-panel.json')
    if (!res.ok) return FALLBACK_CONFIG
    // PiClaw wraps file content in an envelope: { text: "..json string.." }
    const envelope = await res.json()
    const raw = envelope.text ?? envelope.content ?? null
    if (!raw) return FALLBACK_CONFIG
    return JSON.parse(raw) as DevPanelConfig
  } catch {
    return FALLBACK_CONFIG
  }
}

export function DevPanel() {
  const { data: config } = useQuery({
    queryKey: ['dev-panel-config'],
    queryFn: loadDevPanelConfig,
  })
  const { sendMessage } = useChat()
  const { setMainTab } = useLayoutStore()

  if (!config) return <div className="p-4 text-navy-300">Loading...</div>

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="text-sm font-medium text-gray-200 mb-1">{config.title}</h2>
      <p className="text-xs text-navy-300 mb-4">{config.subtitle}</p>

      <div className="space-y-4">
        {config.groups.map((group) => (
          <div key={group.label}>
            <h3 className="text-xs uppercase tracking-wider text-navy-300 mb-2">{group.label}</h3>
            <div className="grid grid-cols-2 gap-2">
              {group.buttons.map((btn) => (
                <button
                  key={btn.command}
                  onClick={() => { sendMessage(btn.command); setMainTab('chat') }}
                  className="flex items-center gap-2 px-3 py-2 bg-navy-600 hover:bg-navy-500 rounded-md text-left transition-colors group"
                  title={btn.hint}
                >
                  <Play size={12} className="text-ai-teal opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div>
                    <div className="text-xs font-medium text-gray-300">{btn.label}</div>
                    <div className="text-[10px] text-navy-300 truncate">{btn.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
