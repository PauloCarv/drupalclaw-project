import { useLayoutStore, type MainTab } from '@/stores/layoutStore'

const tabs: { id: MainTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'editor', label: 'Editor' },
  { id: 'devpanel', label: 'Dev Panel' },
  { id: 'watchdog', label: 'Watchdog' },
  { id: 'flows', label: 'Flows' },
]

export function TabStrip() {
  const { activeMainTab, setMainTab } = useLayoutStore()

  return (
    <div className="flex bg-navy-800 border-b border-navy-500 flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setMainTab(tab.id)}
          className={`px-4 py-1.5 text-xs font-medium border-r border-navy-500 transition-colors ${
            activeMainTab === tab.id ? 'tab-active' : 'tab-inactive'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
