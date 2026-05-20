import { useCallback, useEffect, useState } from 'react'
import * as flowsApi from '@/api/flows'
import type { Flow } from '@/api/flows'

export function useFlows() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [runningFlowId, setRunningFlowId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setFlows(await flowsApi.loadFlows())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const saveFlow = useCallback(async (flow: Flow) => {
    await flowsApi.saveFlow(flow)
    // Register or cancel PiClaw scheduled task
    if (flow.trigger === 'schedule') {
      await flowsApi.registerFlowSchedule(flow)
    } else {
      await flowsApi.cancelFlowSchedule(flow.id)
    }
    setFlows(prev => {
      const idx = prev.findIndex(f => f.id === flow.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = flow; return next }
      return [...prev, flow]
    })
  }, [])

  const removeFlow = useCallback(async (id: string) => {
    await flowsApi.cancelFlowSchedule(id)
    await flowsApi.deleteFlow(id)
    setFlows(prev => prev.filter(f => f.id !== id))
  }, [])

  const runFlow = useCallback(async (flow: Flow, paramValues: Record<string, string>) => {
    if (runningFlowId) return
    setRunningFlowId(flow.id)
    setRunError(null)
    try {
      await flowsApi.triggerManualRun(flow, paramValues)
      // Mark lastRunAt optimistically so UI reflects "triggered now"
      await flowsApi.markFlowRun(flow.id)
      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, lastRunAt: Date.now() } : f))
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Erro ao iniciar flow')
    } finally {
      setRunningFlowId(null)
    }
  }, [runningFlowId])

  return {
    flows,
    loading,
    runningFlowId,
    runError,
    saveFlow,
    removeFlow,
    runFlow,
    reload,
  }
}
