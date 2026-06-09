import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getUsageData } from '@/api/usage'
import { useUsageStore } from '@/stores/usageStore'
import { useChatStore } from '@/stores/chatStore'

export function useUsage() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['usage-data'],
    queryFn: getUsageData,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const addTurn = useUsageStore((s) => s.addTurn)
  const isAgentRunning = useChatStore((s) => s.isAgentRunning)

  // When agent finishes a turn, capture the latest snapshot
  useEffect(() => {
    if (isAgentRunning) return
    if (!data?.latest) return
    addTurn(data.latest)
  }, [isAgentRunning, data?.latest?.runAt])

  return {
    data: data ?? { latest: null, totals: null },
    isLoading,
    lastUpdated: dataUpdatedAt,
  }
}
