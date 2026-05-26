import { useEffect, useRef } from 'react'
import { usePlansStore } from '@/stores/plansStore'
import { getPlan } from '@/api/plans'

// Polls the plan file every 2s when a plan is running.
// Stops when frontmatter status is no longer 'running'.
// Mirror of the mtime-polling pattern used by useWatchdogPolling.
export function usePlanPolling() {
  const { runningPlanId, setRunning, refreshSelectedPlan, addOrUpdateSummary } = usePlansStore()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runningRef = useRef<string | null>(null)

  useEffect(() => {
    runningRef.current = runningPlanId

    if (!runningPlanId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }

    pollRef.current = setInterval(async () => {
      const id = runningRef.current
      if (!id) return
      try {
        const plan = await getPlan(id)
        if (!plan) return
        if (plan.meta.status !== 'running') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setRunning(null)
          addOrUpdateSummary(plan.meta as any)
          await refreshSelectedPlan()
        }
      } catch { /* keep polling */ }
    }, 2000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [runningPlanId, setRunning, refreshSelectedPlan, addOrUpdateSummary])
}
