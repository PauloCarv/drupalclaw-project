import { useQuery } from '@tanstack/react-query'
import { Zap, ShoppingBag } from 'lucide-react'
import { getSkills, type Skill } from '@/api/skills'
import { useChat } from '@/hooks/useChat'
import { useLayoutStore } from '@/stores/layoutStore'
import { loadMarketplaceRegistry } from '@/api/marketplace'

const DRUPAL_FALLBACK: Skill[] = [
  { name: 'drupal-serve', description: 'Start Docker stack', command: '/skill:drupal-serve' },
  { name: 'drupal-init', description: 'Create Drupal project', command: '/skill:drupal-init' },
  { name: 'drupal-cr', description: 'Cache rebuild', command: '/skill:drupal-cr' },
  { name: 'drupal-module', description: 'Scaffold module', command: '/skill:drupal-module' },
  { name: 'drupal-analyze', description: 'PHPStan + PHPCS', command: '/skill:drupal-analyze' },
  { name: 'drupal-fix', description: 'Auto-fix code', command: '/skill:drupal-fix' },
  { name: 'drupal-install', description: 'Install module', command: '/skill:drupal-install' },
  { name: 'drupal-status', description: 'Project status', command: '/skill:drupal-status' },
  { name: 'drupal-debug', description: 'Diagnose errors', command: '/skill:drupal-debug' },
  { name: 'drupal-logs', description: 'Watchdog logs', command: '/skill:drupal-logs' },
  { name: 'drupal-perf', description: 'Performance', command: '/skill:drupal-perf' },
  { name: 'drupal-db-export', description: 'Export DB', command: '/skill:drupal-db-export' },
  { name: 'drupal-db-import', description: 'Import DB', command: '/skill:drupal-db-import' },
  { name: 'drupal-db-query', description: 'SQL query', command: '/skill:drupal-db-query' },
  { name: 'drupal-stack', description: 'Docker stack mgmt', command: '/skill:drupal-stack' },
]

function SkillButton({ skill, onRun, marketplaceSlug }: { skill: Skill; onRun: (cmd: string) => void; marketplaceSlug?: string }) {
  return (
    <button
      onClick={() => onRun(skill.command)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy-500 text-left transition-colors group"
    >
      <Zap size={12} className="text-accent-green flex-shrink-0 group-hover:text-ai-teal transition-colors" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-300 truncate">{skill.name}</span>
          {marketplaceSlug && (
            <span className="flex items-center gap-0.5 text-[9px] text-ai-teal bg-ai-teal/10 px-1 py-0.5 rounded flex-shrink-0">
              <ShoppingBag size={8} />
              {marketplaceSlug}
            </span>
          )}
        </div>
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
  const { data: registry } = useQuery({
    queryKey: ['marketplace-registry'],
    queryFn: loadMarketplaceRegistry,
    staleTime: 30000,
  })
  const { sendMessage } = useChat()
  const { setMainTab } = useLayoutStore()

  const handleRun = (command: string) => {
    sendMessage(command)
    setMainTab('chat')
  }

  const allSkills = skills && skills.length > 0 ? skills : DRUPAL_FALLBACK

  // Build set of marketplace slugs for prefix detection
  const marketplaceSlugs = (registry?.marketplaces ?? []).map((m) => m.slug)

  const getMarketplaceSlug = (skillName: string): string | undefined => {
    for (const slug of marketplaceSlugs) {
      if (skillName.startsWith(`${slug}-`)) return slug
    }
    return undefined
  }

  // silent/internal skills not shown in panel
  const HIDDEN = new Set(['drupal-watchdog-cache'])

  const drupalSkills = allSkills.filter(
    (s) => s.name.startsWith('drupal-') && !HIDDEN.has(s.name)
  )
  const marketplaceSkills = allSkills.filter((s) => {
    if (s.name.startsWith('drupal-')) return false
    return marketplaceSlugs.some((slug) => s.name.startsWith(`${slug}-`))
  })
  const builtinSkills = allSkills.filter(
    (s) => !s.name.startsWith('drupal-') && !marketplaceSkills.includes(s)
  )

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

      {/* Marketplace skills */}
      {marketplaceSkills.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-2 py-1 border-t border-navy-600 pt-3">
            <span className="text-[11px] uppercase tracking-wider text-navy-300 flex items-center gap-1">
              <ShoppingBag size={10} /> Marketplace
            </span>
            <span className="text-[10px] text-navy-400">{marketplaceSkills.length}</span>
          </div>
          <div className="space-y-0.5">
            {marketplaceSkills.map((skill) => (
              <SkillButton
                key={skill.name}
                skill={skill}
                onRun={handleRun}
                marketplaceSlug={getMarketplaceSlug(skill.name)}
              />
            ))}
          </div>
        </div>
      )}

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
