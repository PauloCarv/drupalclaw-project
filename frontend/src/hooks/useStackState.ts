import { useQuery } from '@tanstack/react-query'
import { getStackState } from '@/api/stack'
import type { StackState } from '@/api/stack'

export function useStackState(): StackState | null {
  const { data } = useQuery<StackState | null>({
    queryKey: ['stack-state'],
    queryFn: getStackState,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })
  return data ?? null
}
