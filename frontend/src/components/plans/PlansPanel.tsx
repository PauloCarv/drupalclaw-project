import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { PlansList } from './PlansList'
import { PlanViewer } from './PlanViewer'
import { NewPlanDialog } from './NewPlanDialog'
import { usePlansStore } from '@/stores/plansStore'
import { usePlanPolling } from '@/hooks/usePlanPolling'

export function PlansPanel() {
  const [showNew, setShowNew] = useState(false)
  const { selectedPlan, loading, loadPlans } = usePlansStore()

  // Poll plan file during execution
  usePlanPolling()

  return (
    <div className="flex h-full">
      {/* Left: plans list */}
      <div className="w-64 flex-shrink-0 border-r border-navy-500 flex flex-col bg-navy-700">
        <div className="flex items-center justify-between px-3 py-2 border-b border-navy-500 flex-shrink-0">
          <h3 className="text-[10px] uppercase tracking-wider text-navy-400">Plans</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => loadPlans()}
              disabled={loading}
              className="text-navy-400 hover:text-gray-200 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="text-navy-400 hover:text-white transition-colors"
              title="New plan"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <PlansList onNew={() => setShowNew(true)} />
        </div>
      </div>

      {/* Right: viewer */}
      <div className="flex-1 min-w-0 bg-navy-800">
        {selectedPlan ? (
          <PlanViewer plan={selectedPlan} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <p className="text-sm text-navy-400 mb-3">Select a plan to view it, or create a new one.</p>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-drupal-blue text-white rounded hover:bg-drupal-blue-light transition-colors"
            >
              <Plus size={12} />
              New Plan
            </button>
          </div>
        )}
      </div>

      {showNew && (
        <NewPlanDialog
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  )
}
