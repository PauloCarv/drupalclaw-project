import { useRef } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useLayoutStore } from '@/stores/layoutStore'
import { useStackState } from '@/hooks/useStackState'

// DC context never changes — no container lookup needed
const DC_CONTEXT = {
  id: 'workspace',
  label: 'DC',
  title: 'Shell DrupalClaw (this container)',
  cmd: 'cd /workspace && bash',
  activeClass: 'border-navy-300 text-gray-200 bg-navy-500',
  inactiveClass: 'border-navy-600 text-navy-300 hover:text-gray-200 bg-navy-700 hover:bg-navy-600',
}

function buildContexts(projectName: string | undefined) {
  const f = projectName
    ? `--filter "label=com.docker.compose.project=${projectName}" --filter "status=running"`
    : ''
  const phpGrep = projectName ? `grep -iE 'php|fpm'` : `grep -E 'drupal.*(php|fpm)'`
  const dbGrep  = projectName ? `grep -iE 'db|mysql|mariadb|postgres'` : `grep -E 'drupal.*(db|mysql|mariadb)'`

  return [
    {
      id: 'drupal-php',
      label: 'PHP',
      title: 'Drupal PHP container',
      cmd: `PHP_CONTAINER=$(docker ps ${f} --format '{{.Names}}' 2>/dev/null | ${phpGrep} | head -1) && docker exec -it -w /var/www/html "$PHP_CONTAINER" bash`,
      activeClass: 'border-accent-green text-accent-green bg-accent-green/10',
      inactiveClass: 'border-navy-600 text-accent-green hover:text-green-300 bg-navy-700 hover:bg-navy-600',
    },
    {
      id: 'drupal-db',
      label: 'DB',
      title: 'Database console',
      cmd: `DB_CONTAINER=$(docker ps ${f} --format '{{.Names}}' 2>/dev/null | ${dbGrep} | head -1) && docker exec -it "$DB_CONTAINER" mariadb -u\${MYSQL_USER:-drupal} -p\${MYSQL_PASSWORD:-drupal} \${MYSQL_DATABASE:-drupal}`,
      activeClass: 'border-drupal-blue-light text-drupal-blue-light bg-drupal-blue/10',
      inactiveClass: 'border-navy-600 text-drupal-blue-light hover:text-blue-300 bg-navy-700 hover:bg-navy-600',
    },
    DC_CONTEXT,
  ]
}

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { sendCommand } = useTerminal(containerRef)
  const { terminalCtxId: activeCtxId, setTerminalCtxId: setActiveCtxId } = useLayoutStore()
  const stack = useStackState()
  const CONTEXTS = buildContexts(stack?.project_name)

  const handleContextClick = (ctx: typeof CONTEXTS[0]) => {
    // Clicking the active context exits it (toggle off)
    if (activeCtxId === ctx.id) {
      sendCommand('exit')
      setActiveCtxId(null)
      return
    }

    if (activeCtxId !== null) {
      // Exit current context first, then enter new one after the process
      // fully exits. Combined sends don't work because docker exec -it
      // forwards all bytes to the child PTY — when the child exits the
      // remaining bytes are lost, not returned to the workspace bash.
      sendCommand('exit')
      setTimeout(() => sendCommand(ctx.cmd), 500)
    } else {
      sendCommand(ctx.cmd)
    }
    setActiveCtxId(ctx.id)
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0A1525]">
      {/* Context toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-navy-800 border-b border-navy-600 flex-shrink-0">
        <span className="text-[9px] uppercase tracking-wider text-navy-500 mr-1">Shell</span>
        {CONTEXTS.map((ctx) => {
          const isActive = activeCtxId === ctx.id
          return (
            <button
              key={ctx.id}
              title={ctx.title}
              onClick={() => handleContextClick(ctx)}
              className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border transition-colors ${isActive ? ctx.activeClass : ctx.inactiveClass}`}
            >
              {ctx.label}
            </button>
          )
        })}
        <span className="ml-auto text-[9px] text-navy-500">clica para entrar no contexto</span>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ padding: '4px' }}
      />
    </div>
  )
}
