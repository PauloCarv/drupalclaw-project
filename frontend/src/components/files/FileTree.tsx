import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderPlus, RefreshCw, Loader2, Eye, EyeOff, Trash2, FilePlus, Lock, Pencil } from 'lucide-react'
import { useFiles } from '@/hooks/useFiles'
import { useEditorStore } from '@/stores/editorStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { readFile, getSubtree, createFile, deleteFile } from '@/api/files'
import { runWorkspaceCommand } from '@/api/bash'
import type { FileNode } from '@/api/files'

const HIDDEN_PROBE_PATHS = ['.pi', '.piclaw', '.env.sh', '.gitignore', '.git']

// Paths that cannot be deleted — agent memory, PiClaw internals, git history
const PROTECTED_PREFIXES = ['.pi', '.piclaw', '.git']
const PROTECTED_EXACT = ['AGENTS.md', 'drupal']

function isProtectedPath(path: string): boolean {
  const p = path.replace(/^\/+/, '')
  if (PROTECTED_EXACT.includes(p)) return true
  return PROTECTED_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))
}

type CreateType = 'file' | 'folder' | null

function relativeTime(mtime: string | undefined): string {
  if (!mtime) return ''
  const diff = Date.now() - new Date(mtime).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

async function probeHiddenNodes(): Promise<FileNode[]> {
  const results = await Promise.allSettled(
    HIDDEN_PROBE_PATHS.map(async (p): Promise<FileNode> => {
      const data = await fetch(`/workspace/tree?path=${encodeURIComponent(p)}`).then(r => r.json())
      if (!data?.root) throw new Error('not found')
      const rawType = data.root.type as string
      const type: 'file' | 'dir' = rawType === 'file' ? 'file' : 'dir'
      return { name: p, path: p, type, mtime: data.root.mtime, child_count: data.root.child_count ?? 0 }
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<FileNode> => r.status === 'fulfilled')
    .map(r => r.value)
}

export function FileTree() {
  const { fileTree, refreshFiles } = useFiles()
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [hiddenNodes, setHiddenNodes] = useState<FileNode[]>([])
  const [loadingHidden, setLoadingHidden] = useState(false)
  const [creatingType, setCreatingType] = useState<CreateType>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [rootRenames, setRootRenames] = useState<Map<string, FileNode>>(new Map())
  const newInputRef = useRef<HTMLInputElement>(null)

  const openFile = useEditorStore((s) => s.openFile)
  const setFileContent = useEditorStore((s) => s.setFileContent)
  const setMainTab = useLayoutStore((s) => s.setMainTab)

  useEffect(() => {
    if (!showHidden) { setHiddenNodes([]); return }
    setLoadingHidden(true)
    probeHiddenNodes().then(setHiddenNodes).finally(() => setLoadingHidden(false))
  }, [showHidden])

  useEffect(() => {
    if (creatingType) newInputRef.current?.focus()
  }, [creatingType])

  const handleRefresh = async () => {
    setRefreshing(true)
    setRootRenames(new Map())
    await refreshFiles()
    if (showHidden) {
      const nodes = await probeHiddenNodes()
      setHiddenNodes(nodes)
    }
    setRefreshKey(k => k + 1)
    setRefreshing(false)
  }

  const cancelCreate = () => { setCreatingType(null); setNewName('') }

  const handleCreateSubmit = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      if (creatingType === 'folder') {
        await runWorkspaceCommand(`mkdir -p /workspace/${name}`)
        cancelCreate()
        await handleRefresh()
      } else {
        let filePath: string
        const filename = name.split('/').pop() ?? name
        if (name.includes('/')) {
          const dir = name.split('/').slice(0, -1).join('/')
          await runWorkspaceCommand(`mkdir -p /workspace/${dir} && printf '' > /workspace/${name}`)
          filePath = name
        } else {
          filePath = await createFile(name)
        }
        cancelCreate()
        await handleRefresh()
        openFile(filePath, filename)
        setMainTab('editor')
        setFileContent(filePath, '')
      }
    } catch {
      // leave input open
    } finally {
      setCreating(false)
    }
  }

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCreateSubmit() }
    if (e.key === 'Escape') cancelCreate()
  }

  const allNodes = (showHidden
    ? [...hiddenNodes, ...fileTree].sort((a, b) => a.name.localeCompare(b.name))
    : fileTree
  ).map(n => rootRenames.get(n.path) ?? n)

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-navy-300">Explorer</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreatingType('file'); setNewName('') }}
            className="text-gray-400 hover:text-white transition-colors"
            title="Novo ficheiro"
          >
            <FilePlus size={11} />
          </button>
          <button
            onClick={() => { setCreatingType('folder'); setNewName('') }}
            className="text-gray-400 hover:text-white transition-colors"
            title="Nova pasta"
          >
            <FolderPlus size={11} />
          </button>
          <button
            onClick={() => setShowHidden(h => !h)}
            className={`transition-colors ${showHidden ? 'text-ai-teal' : 'text-gray-400 hover:text-white'}`}
            title={showHidden ? 'Ocultar ficheiros hidden' : 'Mostrar ficheiros hidden'}
          >
            {showHidden ? <Eye size={11} /> : <EyeOff size={11} />}
          </button>
          <button
            onClick={handleRefresh}
            className="text-gray-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loadingHidden && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-navy-400">
          <Loader2 size={9} className="animate-spin" />
          <span>A carregar hidden...</span>
        </div>
      )}

      {creatingType && (
        <div className="flex items-center gap-1 px-1 py-0.5 mb-0.5 rounded bg-navy-600 border border-drupal-blue/40">
          {creatingType === 'folder'
            ? <Folder size={11} className="text-drupal-blue-light flex-shrink-0" />
            : <File size={11} className="text-navy-400 flex-shrink-0" />
          }
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            onBlur={() => { if (!creating) cancelCreate() }}
            placeholder={creatingType === 'folder' ? 'nome-pasta ou pasta/sub' : 'nome.ext ou pasta/nome.ext'}
            className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder:text-navy-400 min-w-0"
          />
          {creating && <Loader2 size={9} className="animate-spin text-navy-400 flex-shrink-0" />}
        </div>
      )}

      <div className="space-y-0.5">
        {allNodes.map((node) => (
          <TreeNode
            key={`${refreshKey}-${node.path}`}
            node={node}
            depth={0}
            isHidden={node.name.startsWith('.')}
            onRefresh={handleRefresh}
            onSiblingRename={(oldPath, newNode) => {
              setRootRenames(prev => { const m = new Map(prev); m.set(oldPath, newNode); return m })
            }}
          />
        ))}
        {allNodes.length === 0 && !loadingHidden && (
          <div className="text-xs text-navy-300 px-2 py-4 text-center">
            No workspace loaded
          </div>
        )}
      </div>
    </div>
  )
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  isHidden?: boolean
  onRefresh: () => Promise<void>
  onSiblingDelete?: (path: string) => void
  onSiblingRename?: (oldPath: string, newNode: FileNode) => void
}

function TreeNode({ node, depth, isHidden = false, onRefresh, onSiblingDelete, onSiblingRename }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [children, setChildren] = useState<FileNode[] | null>(node.children ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameInProgress, setRenameInProgress] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [creatingChildType, setCreatingChildType] = useState<CreateType>(null)
  const [newChildName, setNewChildName] = useState('')
  const [creatingChildInProgress, setCreatingChildInProgress] = useState(false)
  const newChildInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const openFile = useEditorStore((s) => s.openFile)
  const setFileContent = useEditorStore((s) => s.setFileContent)
  const setMainTab = useLayoutStore((s) => s.setMainTab)

  const isDir = node.type === 'dir' || node.type === 'directory'
  const hasChildren = isDir && ((children && children.length > 0) || (node.child_count ?? 0) > 0)
  const paddingLeft = 8 + depth * 12

  useEffect(() => {
    if (creatingChildType) newChildInputRef.current?.focus()
  }, [creatingChildType])

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  const isProtected = isProtectedPath(node.path)

  const handleDeleteConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isProtected) { setConfirmDelete(false); return }
    setDeleting(true)
    try {
      if (isDir) {
        await runWorkspaceCommand(`rm -rf /workspace/${node.path}`)
        const { openFiles, closeFile } = useEditorStore.getState()
        for (let i = openFiles.length - 1; i >= 0; i--) {
          if (openFiles[i].path.startsWith(`${node.path}/`) || openFiles[i].path === node.path) {
            closeFile(i)
          }
        }
      } else {
        await deleteFile(node.path)
        const { openFiles, closeFile } = useEditorStore.getState()
        const idx = openFiles.findIndex((f) => f.path === node.path)
        if (idx >= 0) closeFile(idx)
      }
      // Remove instantly from parent's children list (if parent tracks us)
      onSiblingDelete?.(node.path)
      // Also refresh global tree for root-level deletes
      if (!onSiblingDelete) await onRefresh()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleRenameSubmit = async () => {
    const newName = renameValue.trim().replace(/\/+/g, '')
    if (!newName || newName === node.name || renameInProgress) return
    if (isProtectedPath(node.path)) { setRenaming(false); return }
    setRenameInProgress(true)
    try {
      const parentPath = node.path.includes('/')
        ? node.path.split('/').slice(0, -1).join('/')
        : ''
      const newPath = parentPath ? `${parentPath}/${newName}` : newName
      await runWorkspaceCommand(`mv /workspace/${node.path} /workspace/${newPath}`)
      const { openFiles, closeFile } = useEditorStore.getState()
      if (isDir) {
        for (let i = openFiles.length - 1; i >= 0; i--) {
          if (openFiles[i].path === node.path || openFiles[i].path.startsWith(`${node.path}/`)) closeFile(i)
        }
      } else {
        const idx = openFiles.findIndex(f => f.path === node.path)
        if (idx >= 0) closeFile(idx)
      }
      const newNode: FileNode = { ...node, name: newName, path: newPath }
      onSiblingRename?.(node.path, newNode)
      if (!onSiblingRename) await onRefresh()
      setRenaming(false)
    } catch {
      // leave input open on error
    } finally {
      setRenameInProgress(false)
    }
  }

  const handleClick = useCallback(async () => {
    if (isDir) {
      if (!expanded && children === null && (node.child_count ?? 0) > 0) {
        setLoading(true)
        try {
          const loaded = await getSubtree(node.path)
          setChildren(loaded)
        } finally {
          setLoading(false)
        }
      }
      setExpanded(e => !e)
    } else {
      openFile(node.path, node.name)
      setMainTab('editor')
      try {
        const content = await readFile(node.path)
        setFileContent(node.path, content)
      } catch (err) {
        setFileContent(node.path, `// Error loading file: ${err}`)
      }
    }
  }, [isDir, expanded, children, node, openFile, setMainTab, setFileContent])

  const expandAndCreate = async (type: CreateType) => {
    if (!expanded) {
      if (children === null && (node.child_count ?? 0) > 0) {
        setLoading(true)
        try {
          const loaded = await getSubtree(node.path)
          setChildren(loaded)
        } finally {
          setLoading(false)
        }
      }
      setExpanded(true)
    }
    setCreatingChildType(type)
    setNewChildName('')
  }

  const cancelChildCreate = () => { setCreatingChildType(null); setNewChildName('') }

  const handleCreateChildSubmit = async () => {
    // Strip leading slashes and trailing slash (user might type /drupal/test/ by habit)
    const name = newChildName.trim().replace(/^\/+/, '').replace(/\/$/, '')
    if (!name || creatingChildInProgress) return
    setCreatingChildInProgress(true)
    try {
      const isNested = name.includes('/')
      const parts = name.split('/')
      const filename = parts[parts.length - 1]
      const fullRelPath = `${node.path}/${name}`

      if (creatingChildType === 'folder') {
        await runWorkspaceCommand(`mkdir -p /workspace/${fullRelPath}`)
        cancelChildCreate()
        if (!isNested) {
          // Immediately add folder to local children for instant feedback
          setChildren(prev => {
            const newNode: FileNode = { name, path: fullRelPath, type: 'dir', child_count: 0 }
            return sortNodes([...(prev ?? []), newNode])
          })
        } else {
          await onRefresh()
        }
      } else {
        const subDir = isNested ? `${node.path}/${parts.slice(0, -1).join('/')}` : node.path
        await runWorkspaceCommand(`mkdir -p /workspace/${subDir} && printf '' > /workspace/${fullRelPath}`)
        cancelChildCreate()
        if (!isNested) {
          // Immediately add file to local children for instant feedback
          setChildren(prev => {
            const newNode: FileNode = { name: filename, path: fullRelPath, type: 'file' }
            return sortNodes([...(prev ?? []), newNode])
          })
        } else {
          await onRefresh()
        }
        openFile(fullRelPath, filename)
        setMainTab('editor')
        try {
          const content = await readFile(fullRelPath)
          setFileContent(fullRelPath, content)
        } catch {
          setFileContent(fullRelPath, '')
        }
      }
    } catch {
      // leave input open
    } finally {
      setCreatingChildInProgress(false)
    }
  }

  const handleCreateChildKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCreateChildSubmit() }
    if (e.key === 'Escape') cancelChildCreate()
  }

  const age = relativeTime(node.mtime)

  return (
    <div>
      {renaming ? (
        <div
          className="flex items-center gap-1 py-0.5 px-1 rounded bg-navy-600 border border-drupal-blue/40"
          style={{ paddingLeft }}
        >
          {isDir
            ? <Folder size={13} className="text-drupal-blue-light flex-shrink-0" />
            : <File size={13} className="text-navy-400 flex-shrink-0" />
          }
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit() }
              if (e.key === 'Escape') setRenaming(false)
            }}
            onBlur={() => { if (!renameInProgress) setRenaming(false) }}
            className="flex-1 bg-transparent text-xs text-gray-200 outline-none min-w-0"
          />
          {renameInProgress && <Loader2 size={9} className="animate-spin text-navy-400 flex-shrink-0" />}
        </div>
      ) : confirmDelete ? (
        <div
          className="flex items-center gap-1 py-0.5 px-1 rounded bg-accent-red/10 border border-accent-red/20"
          style={{ paddingLeft: 8 }}
        >
          <Trash2 size={10} className="text-accent-red flex-shrink-0" />
          <span className="text-[10px] text-accent-red flex-1 truncate">
            {isDir ? `Delete ${node.name}/ and contents?` : `Delete ${node.name}?`}
          </span>
          <button
            onClick={handleDeleteConfirm}
            disabled={deleting}
            className="text-[9px] font-medium text-accent-red hover:bg-accent-red/20 px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 size={8} className="animate-spin" /> : 'Sim'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
            className="text-[9px] text-navy-400 hover:text-gray-300 px-1.5 py-0.5 rounded transition-colors"
          >
            No
          </button>
        </div>
      ) : (
        <div
          className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer w-full ${hovered ? 'bg-navy-500' : ''}`}
          style={{ paddingLeft }}
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span className="w-3 flex-shrink-0">
            {isDir && hasChildren && (
              loading
                ? <Loader2 size={10} className="text-navy-300 animate-spin" />
                : expanded
                  ? <ChevronDown size={12} className="text-navy-300" />
                  : <ChevronRight size={12} className="text-navy-300" />
            )}
          </span>

          {isDir
            ? <Folder size={13} className={`flex-shrink-0 ${isHidden ? 'text-navy-400' : 'text-drupal-blue-light'}`} />
            : <File size={13} className="text-navy-400 flex-shrink-0" />
          }

          <span className={`text-xs truncate flex-1 ${isHidden ? 'text-navy-300 italic' : 'text-gray-300'}`}>
            {node.name}
          </span>

          <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            {isDir && age && <span className="text-[10px] text-gray-400">{age}</span>}
            {isDir && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); expandAndCreate('file') }}
                  className="p-0.5 rounded text-gray-400 hover:text-white transition-colors"
                  title={`Novo ficheiro em ${node.name}`}
                >
                  <FilePlus size={9} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); expandAndCreate('folder') }}
                  className="p-0.5 rounded text-gray-400 hover:text-white transition-colors"
                  title={`Nova pasta em ${node.name}`}
                >
                  <FolderPlus size={9} />
                </button>
              </>
            )}
            {isProtected ? (
              <span
                className="p-0.5 text-navy-500"
                title="System protected — cannot be deleted or renamed"
              >
                <Lock size={9} />
              </span>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setRenameValue(node.name); setRenaming(true) }}
                  className="p-0.5 rounded text-gray-400 hover:text-white transition-colors"
                  title={`Renomear ${node.name}`}
                >
                  <Pencil size={9} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="p-0.5 rounded text-gray-400 hover:text-accent-red transition-colors"
                  title={`Delete ${node.name}`}
                >
                  <Trash2 size={9} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {isDir && expanded && (
        <div>
          {creatingChildType && (
            <div
              className="flex items-center gap-1 py-0.5 px-1 mb-0.5 rounded bg-navy-600 border border-drupal-blue/40"
              style={{ paddingLeft: paddingLeft + 12 }}
            >
              {creatingChildType === 'folder'
                ? <Folder size={11} className="text-drupal-blue-light flex-shrink-0" />
                : <File size={11} className="text-navy-400 flex-shrink-0" />
              }
              <span className="text-[10px] text-navy-400 flex-shrink-0 select-none">{node.name}/</span>
              <input
                ref={newChildInputRef}
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                onKeyDown={handleCreateChildKeyDown}
                onBlur={() => { if (!creatingChildInProgress) cancelChildCreate() }}
                placeholder={creatingChildType === 'folder' ? 'nova-pasta' : 'ficheiro.ext'}
                className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder:text-navy-400 min-w-0"
              />
              {creatingChildInProgress && <Loader2 size={9} className="animate-spin text-navy-400 flex-shrink-0" />}
            </div>
          )}
          {children && children.length > 0 && children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isHidden={isHidden || child.name.startsWith('.')}
              onRefresh={onRefresh}
              onSiblingDelete={(deletedPath) => {
                setChildren(prev => (prev ?? []).filter(c => c.path !== deletedPath))
              }}
              onSiblingRename={(oldPath, newNode) => {
                setChildren(prev => sortNodes((prev ?? []).map(c => c.path === oldPath ? newNode : c)))
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    const aIsDir = a.type === 'dir' || a.type === 'directory'
    const bIsDir = b.type === 'dir' || b.type === 'directory'
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
