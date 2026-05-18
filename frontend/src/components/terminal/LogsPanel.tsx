import { useRef, useState } from 'react'
import { useTerminal } from '@/hooks/useTerminal'

const CONTAINERS = [
  { id: 'php',   name: 'drupal-dev-php-1',    label: 'PHP',   color: 'text-accent-green',      activeClass: 'border-accent-green bg-accent-green/10' },
  { id: 'nginx', name: 'drupal-dev-nginx-1',  label: 'nginx', color: 'text-yellow-400',         activeClass: 'border-yellow-400 bg-yellow-400/10' },
  { id: 'db',    name: 'drupal-dev-db-1',     label: 'DB',    color: 'text-drupal-blue-light',  activeClass: 'border-drupal-blue-light bg-drupal-blue/10' },
  { id: 'dc',    name: 'docker-drupalclaw-1', label: 'DC',    color: 'text-navy-300',            activeClass: 'border-navy-300 bg-navy-500/20' },
]

export function LogsPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  // Separate PTY session — independent from the Terminal/Drush shared session
  const { sendCommand, sendRaw } = useTerminal(containerRef, { storageKey: 'piclaw_logs_client' })

  const [activeId, setActiveId] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)

  const showLogs = (c: typeof CONTAINERS[0], follow: boolean) => {
    if (activeId !== null) {
      sendRaw('\x03') // Ctrl+C — stop any running docker logs -f
    }
    const flags = follow ? `-f --tail=80` : `--tail=300`
    // Brief pause after Ctrl+C before sending next command
    const delay = activeId !== null ? 200 : 0
    setTimeout(() => {
      sendCommand(`docker logs ${flags} --timestamps ${c.name}`)
    }, delay)
    setActiveId(c.id)
    setFollowing(follow)
  }

  const stopFollow = () => {
    sendRaw('\x03')
    setFollowing(false)
  }

  const active = CONTAINERS.find((c) => c.id === activeId)

  return (
    <div className="h-full w-full flex flex-col bg-[#0A1525]">
      <div className="flex items-center gap-1 px-2 py-1 bg-navy-800 border-b border-navy-600 flex-shrink-0">
        <span className="text-[9px] uppercase tracking-wider text-navy-500 mr-1">Container</span>

        {CONTAINERS.map((c) => {
          const isActive = activeId === c.id
          return (
            <button
              key={c.id}
              title={c.name}
              onClick={() => showLogs(c, following)}
              className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border transition-colors ${
                isActive ? `${c.activeClass} ${c.color}` : `border-navy-600 bg-navy-700 hover:bg-navy-600 ${c.color}`
              }`}
            >
              {c.label}
            </button>
          )
        })}

        <div className="w-px h-3 bg-navy-600 mx-1 flex-shrink-0" />

        {/* Follow toggle */}
        <button
          title="Seguir logs em tempo real (docker logs -f)"
          onClick={() => {
            if (active) showLogs(active, !following)
            else setFollowing((f) => !f)
          }}
          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border transition-colors ${
            following
              ? 'border-accent-green text-accent-green bg-accent-green/10'
              : 'border-navy-600 text-navy-400 bg-navy-700 hover:bg-navy-600'
          }`}
        >
          follow
        </button>

        {following && (
          <button
            title="Parar follow (Ctrl+C)"
            onClick={stopFollow}
            className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-navy-600 bg-navy-700 hover:bg-navy-600 text-accent-red transition-colors"
          >
            stop
          </button>
        )}

        <span className="ml-auto text-[9px] text-navy-500 truncate">
          {active ? active.name : 'selecciona um container'}
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ padding: '4px' }}
      />
    </div>
  )
}
