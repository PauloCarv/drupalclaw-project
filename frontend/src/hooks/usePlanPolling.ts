import { useEffect, useRef } from 'react'
import { usePlansStore } from '@/stores/plansStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { getPlan } from '@/api/plans'

// Polls the plan file every 2s when a plan is running.
// Stops when frontmatter status is no longer 'running'.
// Mirror of the mtime-polling pattern used by useWatchdogPolling.
export function usePlanPolling() {
  const { runningPlanId, setRunning, refreshSelectedPlan, addOrUpdateSummary } = usePlansStore()
  const { setMainTab } = useLayoutStore()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runningRef = useRef<string | null>(null)

  useEffect(() => {
    runningRef.current = runningPlanId

    if (!runningPlanId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }

    // Only auto-switch to Chat after we've confirmed the plan reached 'running'
    // Prevents switching immediately when status is still 'draft' after the reset
    let hasSeenRunning = false

    pollRef.current = setInterval(async () => {
      const id = runningRef.current
      if (!id) return
      try {
        const plan = await getPlan(id)
        if (!plan) return
        if (plan.meta.status === 'running') hasSeenRunning = true
        // Always refresh the selected plan so checkboxes update live
        await refreshSelectedPlan()
        const finished = plan.meta.status === 'completed' || plan.meta.status === 'failed'
        // Stop when: explicitly finished, OR we saw 'running' and it's now gone
        if (finished || (hasSeenRunning && plan.meta.status !== 'running')) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setRunning(null)
          addOrUpdateSummary(plan.meta as any)
          setMainTab('chat')
        }
      } catch { /* keep polling */ }
    }, 1000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [runningPlanId, setRunning, refreshSelectedPlan, addOrUpdateSummary, setMainTab])
}
