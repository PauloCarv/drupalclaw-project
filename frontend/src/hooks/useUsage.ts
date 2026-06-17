import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getUsageData } from '@/api/usage'
import { useUsageStore } from '@/stores/usageStore'

export function useUsage() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['usage-data'],
    queryFn: getUsageData,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const addTurn = useUsageStore((s) => s.addTurn)

  // Capture every new turn snapshot as soon as it appears (addTurn dedups by runAt)
  useEffect(() => {
    if (!data?.latest) return
    addTurn(data.latest)
  }, [data?.latest?.runAt])

  return {
    data: data ?? { latest: null, totals: null },
    isLoading,
    lastUpdated: dataUpdatedAt,
  }
}
