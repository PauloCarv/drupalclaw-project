import { useLayoutStore, type BottomTab } from '@/stores/layoutStore'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { DrushPanel } from '@/components/terminal/DrushPanel'
import { LogsPanel } from '@/components/terminal/LogsPanel'
import { DockerPanel } from '@/components/terminal/DockerPanel'

const tabs: { id: BottomTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'drush', label: 'Drush' },
  { id: 'logs', label: 'Logs' },
  { id: 'docker', label: 'Docker' },
]

export function BottomPanel() {
  const { activeBottomTab, setBottomTab } = useLayoutStore()

  const renderContent = () => {
    switch (activeBottomTab) {
      case 'terminal': return <TerminalPanel />
      case 'drush':    return <DrushPanel />
      case 'logs':     return <LogsPanel />
      case 'docker':   return <DockerPanel />
      default:         return <TerminalPanel />
    }
  }

  return (
    <div className="h-full flex flex-col bg-navy-800">
      <div className="flex border-b border-navy-500 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setBottomTab(tab.id)}
            className={`px-3 py-1 text-[11px] font-medium border-r border-navy-500 transition-colors ${
              activeBottomTab === tab.id
                ? 'text-ai-teal border-b-2 border-b-ai-teal'
                : 'text-navy-300 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  )
}
