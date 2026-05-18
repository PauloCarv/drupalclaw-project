import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { getSkills, type Skill } from '@/api/skills'
import { useChat } from '@/hooks/useChat'
import { useLayoutStore } from '@/stores/layoutStore'

const DRUPAL_FALLBACK: Skill[] = [
  { name: 'drupal-serve', description: 'Inicia stack Docker', command: '/skill:drupal-serve' },
  { name: 'drupal-init', description: 'Cria projecto Drupal', command: '/skill:drupal-init' },
  { name: 'drupal-cr', description: 'Cache rebuild', command: '/skill:drupal-cr' },
  { name: 'drupal-module', description: 'Scaffolda módulo', command: '/skill:drupal-module' },
  { name: 'drupal-analyze', description: 'PHPStan + PHPCS', command: '/skill:drupal-analyze' },
  { name: 'drupal-fix', description: 'Auto-fix código', command: '/skill:drupal-fix' },
  { name: 'drupal-install', description: 'Instala módulo', command: '/skill:drupal-install' },
  { name: 'drupal-status', description: 'Estado do projecto', command: '/skill:drupal-status' },
  { name: 'drupal-debug', description: 'Diagnostica erros', command: '/skill:drupal-debug' },
  { name: 'drupal-logs', description: 'Watchdog logs', command: '/skill:drupal-logs' },
  { name: 'drupal-perf', description: 'Performance', command: '/skill:drupal-perf' },
  { name: 'drupal-db-export', description: 'Exporta BD', command: '/skill:drupal-db-export' },
  { name: 'drupal-db-import', description: 'Importa BD', command: '/skill:drupal-db-import' },
  { name: 'drupal-db-query', description: 'Query SQL', command: '/skill:drupal-db-query' },
  { name: 'drupal-stack', description: 'Gestão stack Docker', command: '/skill:drupal-stack' },
]

function SkillButton({ skill, onRun }: { skill: Skill; onRun: (cmd: string) => void }) {
  return (
    <button
      onClick={() => onRun(skill.command)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy-500 text-left transition-colors group"
    >
      <Zap size={12} className="text-accent-green flex-shrink-0 group-hover:text-ai-teal transition-colors" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-300 truncate">{skill.name}</div>
        <div className="text-[10px] text-navy-300 truncate">{skill.description}</div>
      </div>
    </button>
  )
}

export function SkillsList() {
  const { data: skills } = useQuery({
    queryKey: ['skills'],
    queryFn: getSkills,
  })
  const { sendMessage } = useChat()
  const { setMainTab } = useLayoutStore()

  const handleRun = (command: string) => {
    sendMessage(command)
    setMainTab('chat')
  }

  const allSkills = skills && skills.length > 0 ? skills : DRUPAL_FALLBACK

  // silent/internal skills not shown in panel
  const HIDDEN = new Set(['drupal-watchdog-cache'])

  const drupalSkills = allSkills.filter(
    (s) => s.name.startsWith('drupal-') && !HIDDEN.has(s.name)
  )
  const builtinSkills = allSkills.filter((s) => !s.name.startsWith('drupal-'))

  return (
    <div className="h-full overflow-y-auto p-2 space-y-3">
      {/* Drupal skills */}
      <div>
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] uppercase tracking-wider text-navy-300">Drupal</span>
          <span className="text-[10px] text-navy-400">{drupalSkills.length}</span>
        </div>
        <div className="space-y-0.5">
          {drupalSkills.map((skill) => (
            <SkillButton key={skill.name} skill={skill} onRun={handleRun} />
          ))}
        </div>
      </div>

      {/* PiClaw built-in skills */}
      {builtinSkills.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-2 py-1 border-t border-navy-600 pt-3">
            <span className="text-[11px] uppercase tracking-wider text-navy-300">PiClaw</span>
            <span className="text-[10px] text-navy-400">{builtinSkills.length}</span>
          </div>
          <div className="space-y-0.5">
            {builtinSkills.map((skill) => (
              <SkillButton key={skill.name} skill={skill} onRun={handleRun} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
