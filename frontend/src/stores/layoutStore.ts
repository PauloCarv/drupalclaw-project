import { create } from 'zustand'

export type MainTab = 'chat' | 'editor' | 'devpanel' | 'watchdog' | 'flows'
export type BottomTab = 'terminal' | 'drush' | 'logs' | 'docker'
export type SidebarSection = 'explorer' | 'skills' | 'chats' | 'settings'

interface LayoutState {
  sidebarOpen: boolean
  sidebarSection: SidebarSection
  contextPanelOpen: boolean
  activeMainTab: MainTab
  activeBottomTab: BottomTab
  bottomPanelOpen: boolean
  bottomPanelHeight: number
  terminalCtxId: string | null  // shared across Terminal + Drush tabs

  toggleSidebar: () => void
  setSidebarSection: (section: SidebarSection) => void
  toggleContextPanel: () => void
  setMainTab: (tab: MainTab) => void
  setBottomTab: (tab: BottomTab) => void
  toggleBottomPanel: () => void
  setBottomPanelHeight: (height: number) => void
  setTerminalCtxId: (id: string | null) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  sidebarSection: 'explorer',
  contextPanelOpen: true,
  activeMainTab: 'chat',
  activeBottomTab: 'terminal',
  bottomPanelOpen: false,
  bottomPanelHeight: 200,
  terminalCtxId: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarSection: (section) => set({ sidebarSection: section, sidebarOpen: true }),
  toggleContextPanel: () => set((s) => ({ contextPanelOpen: !s.contextPanelOpen })),
  setMainTab: (tab) => set({ activeMainTab: tab }),
  setBottomTab: (tab) => set({ activeBottomTab: tab, bottomPanelOpen: true }),
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
  setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),
  setTerminalCtxId: (id) => set({ terminalCtxId: id }),
}))
