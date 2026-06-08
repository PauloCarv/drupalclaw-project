import { useQuery } from '@tanstack/react-query'

const REPO = 'PauloCarv/drupalclaw-project'

export interface VersionInfo {
  current: string
  latest: string
  hasUpdate: boolean
  releaseUrl: string
}

export function useVersionCheck() {
  return useQuery<VersionInfo | null>({
    queryKey: ['version-check'],
    queryFn: async () => {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      if (!res.ok) return null
      const data = await res.json()
      const latest = (data.tag_name as string)?.replace(/^v/, '') ?? null
      if (!latest) return null
      const current = __APP_VERSION__
      return {
        current,
        latest,
        hasUpdate: latest !== current,
        releaseUrl: data.html_url as string,
      }
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
