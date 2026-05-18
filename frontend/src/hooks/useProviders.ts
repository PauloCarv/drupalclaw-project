import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as providersApi from '@/api/providers'

export function useProviders() {
  const queryClient = useQueryClient()

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.getProviders,
  })

  const { data: modelData, refetch: refetchModels } = useQuery({
    queryKey: ['model-options'],
    queryFn: providersApi.getModelOptions,
    staleTime: 60000,
  })

  const switchModel = useMutation({
    mutationFn: async (label: string) => {
      await providersApi.switchModel(label)
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['model-options'] })
        refetchModels()
      }, 1500)
    },
  })

  const activeProvider = providers?.find((p) => p.active)
  const currentModel = modelData?.model_options.find((m) => m.label === modelData.current)

  return {
    providers: providers || [],
    modelOptions: modelData?.model_options || [],
    currentModelLabel: modelData?.current || '',
    currentModel,
    activeProvider,
    switchModel: switchModel.mutate,
    isSwitching: switchModel.isPending,
  }
}
