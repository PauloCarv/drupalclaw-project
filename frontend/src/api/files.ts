/**
 * File API — workspace file operations.
 *
 * PiClaw routes (dispatch-workspace.ts):
 *   - GET    /workspace/tree               → directory tree
 *   - GET    /workspace/file?path=...      → read file content
 *   - PUT    /workspace/file?path=...      → update file
 *   - POST   /workspace/file               → create file
 *   - DELETE /workspace/file?path=...      → delete file
 *   - GET    /workspace/branch             → git branch info
 *   - POST   /workspace/visibility         → toggle workspace visibility
 */

import { apiGet, apiPost, apiPut, apiDelete } from './client'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir' | 'directory'
  children?: FileNode[]
  child_count?: number
  size?: number | null
  mtime?: string
}

function extractChildren(data: any): FileNode[] {
  if (data?.root?.children && Array.isArray(data.root.children)) return data.root.children
  if (Array.isArray(data)) return data
  if (data?.tree && Array.isArray(data.tree)) return data.tree
  if (data?.children && Array.isArray(data.children)) return data.children
  return []
}

export async function getFileTree(): Promise<FileNode[]> {
  try {
    return extractChildren(await apiGet<any>('/workspace/tree'))
  } catch {
    return []
  }
}

export async function getSubtree(path: string): Promise<FileNode[]> {
  try {
    return extractChildren(await apiGet<any>(`/workspace/tree?path=${encodeURIComponent(path)}`))
  } catch {
    return []
  }
}

export async function readFile(path: string): Promise<string> {
  const res = await fetch(`/workspace/file?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`Failed to read file: ${path}`)
  const envelope = await res.json()
  return envelope.text ?? ''
}

export async function writeFile(path: string, content: string): Promise<void> {
  // PiClaw PUT endpoint reads path from body, NOT from query string
  await apiPut('/workspace/file', { path, content })
}

export async function createFile(name: string, content = ''): Promise<string> {
  // PiClaw POST creates at workspace root only; name must not contain '/'
  const res = await apiPost<{ path: string }>('/workspace/file', { name, content })
  return res.path
}

export async function deleteFile(path: string): Promise<void> {
  await apiDelete(`/workspace/file?path=${encodeURIComponent(path)}`)
}
