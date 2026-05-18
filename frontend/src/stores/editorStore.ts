import { create } from 'zustand'

export interface OpenFile {
  path: string
  name: string
  content: string
  modified: boolean
  loading: boolean
}

interface EditorState {
  openFiles: OpenFile[]
  activeFileIndex: number

  openFile: (path: string, name: string) => void
  setFileContent: (path: string, content: string) => void
  setFileLoading: (path: string, loading: boolean) => void
  closeFile: (index: number) => void
  setActiveFile: (index: number) => void
  markModified: (path: string) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFileIndex: -1,

  openFile: (path, name) => {
    const { openFiles } = get()
    const existing = openFiles.findIndex((f) => f.path === path)
    if (existing >= 0) {
      set({ activeFileIndex: existing })
      return
    }
    const newFile: OpenFile = { path, name, content: '', modified: false, loading: true }
    set({
      openFiles: [...openFiles, newFile],
      activeFileIndex: openFiles.length,
    })
  },

  setFileContent: (path, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, loading: false } : f
      ),
    }))
  },

  setFileLoading: (path, loading) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, loading } : f
      ),
    }))
  },

  closeFile: (index) => {
    set((s) => {
      const newFiles = s.openFiles.filter((_, i) => i !== index)
      let newActive = s.activeFileIndex
      if (index === s.activeFileIndex) {
        newActive = Math.min(index, newFiles.length - 1)
      } else if (index < s.activeFileIndex) {
        newActive = s.activeFileIndex - 1
      }
      return { openFiles: newFiles, activeFileIndex: newActive }
    })
  },

  setActiveFile: (index) => set({ activeFileIndex: index }),

  markModified: (path) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, modified: true } : f
      ),
    }))
  },

  updateContent: (path, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, modified: true } : f
      ),
    }))
  },

  markSaved: (path) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, modified: false } : f
      ),
    }))
  },
}))
