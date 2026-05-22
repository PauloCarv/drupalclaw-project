import { useRef } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useLayoutStore } from '@/stores/layoutStore'
import { useStackState } from '@/hooks/useStackState'

function buildPhpCmd(projectName: string | undefined): string {
  if (projectName) {
    return `PHP_CONTAINER=$(docker ps --filter "label=com.docker.compose.project=${projectName}" --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -iE 'php|fpm' | head -1) && docker exec -it -w /var/www/html "$PHP_CONTAINER" bash`
  }
  return `PHP_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'drupal.*(php|fpm)' | head -1) && docker exec -it -w /var/www/html "$PHP_CONTAINER" bash`
}

const DRUSH = 'vendor/bin/drush'

const DRUSH_CMDS = [
  { label: 'cr',     title: 'Cache Rebuild',       cmd: `${DRUSH} cr` },
  { label: 'updb',   title: 'Database Updates',     cmd: `${DRUSH} updb -y` },
  { label: 'cex',    title: 'Config Export',        cmd: `${DRUSH} cex -y` },
  { label: 'cim',    title: 'Config Import',        cmd: `${DRUSH} cim -y` },
  { label: 'uli',    title: 'One-time Login URL',   cmd: `${DRUSH} uli` },
  { label: 'ws',     title: 'Watchdog Show (50)',   cmd: `${DRUSH} ws --count=50` },
  { label: 'status', title: 'Drupal Status',        cmd: `${DRUSH} status` },
  { label: 'pmu',    title: 'Uninstall module…',    cmd: `${DRUSH} pmu ` },
  { label: 'en',     title: 'Enable module…',       cmd: `${DRUSH} en ` },
]

export function DrushPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { sendCommand } = useTerminal(containerRef)
  const { terminalCtxId, setTerminalCtxId } = useLayoutStore()
  const stack = useStackState()
  const PHP_CMD = buildPhpCmd(stack?.project_name)

  const inPhp = terminalCtxId === 'drupal-php'

  const handlePhp = () => {
    if (inPhp) {
      sendCommand('exit')
      setTerminalCtxId(null)
    } else {
      if (terminalCtxId !== null) {
        sendCommand('exit')
        setTimeout(() => sendCommand(PHP_CMD), 500)
      } else {
        sendCommand(PHP_CMD)
      }
      setTerminalCtxId('drupal-php')
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0A1525]">
      <div className="flex items-center gap-1 px-2 py-1 bg-navy-800 border-b border-navy-600 flex-shrink-0 flex-wrap">
        {/* PHP context toggle */}
        <button
          title="Enter/exit PHP container (required context for Drush)"
          onClick={handlePhp}
          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border transition-colors ${
            inPhp
              ? 'border-accent-green text-accent-green bg-accent-green/10'
              : 'border-navy-600 text-navy-400 bg-navy-700 hover:bg-navy-600 hover:text-accent-green'
          }`}
        >
          PHP
        </button>

        <div className="w-px h-3 bg-navy-600 mx-1 flex-shrink-0" />

        {/* Drush command buttons — auto-enter PHP if not already there */}
        {DRUSH_CMDS.map((c) => (
          <button
            key={c.label}
            title={c.title}
            onClick={() => {
              if (!inPhp) {
                // Enter PHP first, then run drush after bash is ready
                if (terminalCtxId !== null) {
                  sendCommand('exit')
                  setTimeout(() => { sendCommand(PHP_CMD); setTimeout(() => sendCommand(c.cmd), 600) }, 500)
                } else {
                  sendCommand(PHP_CMD)
                  setTimeout(() => sendCommand(c.cmd), 600)
                }
                setTerminalCtxId('drupal-php')
              } else {
                sendCommand(c.cmd)
              }
            }}
            className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-navy-600 bg-navy-700 hover:bg-navy-600 text-drupal-blue-light hover:text-blue-300 transition-colors"
          >
            {c.label}
          </button>
        ))}

        <span className="ml-auto text-[9px] text-navy-500 flex-shrink-0">
          {inPhp ? 'PHP activo' : 'entra em PHP primeiro'}
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
