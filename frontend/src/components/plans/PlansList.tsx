import { useEffect } from 'react'
import { Plus, Loader2, ClipboardList } from 'lucide-react'
import { usePlansStore } from '@/stores/plansStore'
import { useLayoutStore } from '@/stores/layoutStore'
import type { PlanSummary } from '@/api/plans'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-navy-500 text-navy-300',
  ready: 'bg-drupal-blue/20 text-drupal-blue-light border border-drupal-blue/30',
  running: 'bg-ai-teal/15 text-ai-teal border border-ai-teal/30 animate-pulse',
  completed: 'bg-accent-green/15 text-accent-green border border-accent-green/30',
  failed: 'bg-accent-red/15 text-accent-red border border-accent-red/30',
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'manual',
  chat: 'chat',
}

function sourceLabel(source: string): string {
  if (source.startsWith('flow:')) return 'flow'
  return SOURCE_LABEL[source] ?? source
}

function PlanRow({ plan, selected, compact, onClick }: {
  plan: PlanSummary
  selected: boolean
  compact: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2.5 py-2 rounded transition-colors ${
        selected ? 'bg-navy-600 text-white' : 'text-navy-300 hover:bg-navy-600 hover:text-gray-200'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="block text-xs truncate">{plan.title}</span>
          {!compact && (
            <span className="block text-[10px] text-navy-400 mt-0.5 truncate">{sourceLabel(plan.source)}</span>
          )}
        </div>
        <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[plan.status] ?? STATUS_STYLES.draft}`}>
          {plan.status}
        </span>
      </div>
    </button>
  )
}

export function PlansList({ compact = false, onNew }: { compact?: boolean; onNew?: () => void }) {
  const { plans, loading, selectedPlanId, loadPlans, selectPlan } = usePlansStore()
  const { setMainTab } = useLayoutStore()

  useEffect(() => {
    if (plans.length === 0) loadPlans()
  }, [])

  const handleSelect = async (id: string) => {
    await selectPlan(id)
    setMainTab('plans')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-navy-500 flex-shrink-0">
        <h3 className="text-[10px] uppercase tracking-wider text-navy-400">Plans</h3>
        <div className="flex items-center gap-1">
          {loading && <Loader2 size={11} className="animate-spin text-navy-400" />}
          {onNew && (
            <button
              type="button"
              onClick={onNew}
              className="text-navy-400 hover:text-white transition-colors"
              title="New plan"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {plans.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-2">
            <ClipboardList size={24} className="text-navy-500 mb-2" />
            <p className="text-[11px] text-navy-400">No plans yet.</p>
            {!compact && onNew && (
              <button type="button" onClick={onNew} className="mt-2 text-[11px] text-ai-teal hover:underline">
                Create one
              </button>
            )}
          </div>
        )}
        {plans.map((plan) => (
          <PlanRow
            key={plan.id}
            plan={plan}
            selected={plan.id === selectedPlanId}
            compact={compact}
            onClick={() => handleSelect(plan.id)}
          />
        ))}
      </div>
    </div>
  )
}
