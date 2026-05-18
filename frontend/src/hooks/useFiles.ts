import { useQuery } from '@tanstack/react-query'
import * as filesApi from '@/api/files'

export function useFiles() {
  const { data: fileTree, refetch } = useQuery({
    queryKey: ['file-tree'],
    queryFn: filesApi.getFileTree,
    staleTime: 30000,
  })

  return {
    fileTree: fileTree || [],
    refreshFiles: refetch,
    readFile: filesApi.readFile,
    writeFile: filesApi.writeFile,
    deleteFile: filesApi.deleteFile,
    getSubtree: filesApi.getSubtree,
  }
}
