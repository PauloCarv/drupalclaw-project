import { create } from 'zustand'
import type { ChatMessage, ChatSession } from '@/api/chat'

export interface ActivityItem {
  id: string
  type: 'tool' | 'intent' | 'error'
  title: string
  toolName?: string
  status: 'working' | 'done' | 'failed' | 'info'
  ts: number
}

interface AgentActivity {
  thought: string
  draft: string
  items: ActivityItem[]
}

const EMPTY_ACTIVITY: AgentActivity = { thought: '', draft: '', items: [] }
const MAX_ITEMS = 6

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  isAgentRunning: boolean
  streamingContent: string
  streamingStartedAt: number | null
  agentActivity: AgentActivity
  userName: string | null

  setSessions: (sessions: ChatSession[]) => void
  setUserName: (name: string | null) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  setStreaming: (streaming: boolean) => void
  setAgentRunning: (running: boolean) => void
  setStreamingStartedAt: (ts: number | null) => void
  appendStreamContent: (chunk: string) => void
  setStreamContent: (content: string) => void
  clearStreamContent: () => void

  setThought: (text: string) => void
  setDraft: (text: string) => void
  pushActivityItem: (item: ActivityItem) => void
  updateLastToolStatus: (toolName: string, status: 'done' | 'failed', title: string) => void
  clearActivity: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  isStreaming: false,
  isAgentRunning: false,
  streamingContent: '',
  streamingStartedAt: null,
  agentActivity: EMPTY_ACTIVITY,
  userName: null,

  setSessions: (sessions) => set({ sessions }),
  setUserName: (userName) => set({ userName }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setAgentRunning: (isAgentRunning) => set({ isAgentRunning }),
  setStreamingStartedAt: (streamingStartedAt) => set({ streamingStartedAt }),
  appendStreamContent: (chunk) => set((state) => ({ streamingContent: state.streamingContent + chunk })),
  setStreamContent: (streamingContent) => set({ streamingContent }),
  clearStreamContent: () => set({ streamingContent: '' }),

  setThought: (thought) => set((s) => ({ agentActivity: { ...s.agentActivity, thought } })),
  setDraft: (draft) => set((s) => ({ agentActivity: { ...s.agentActivity, draft } })),

  pushActivityItem: (item) => set((s) => ({
    agentActivity: {
      ...s.agentActivity,
      items: [...s.agentActivity.items, item].slice(-MAX_ITEMS),
    },
  })),

  updateLastToolStatus: (toolName, status, title) => set((s) => {
    const items = [...s.agentActivity.items]
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].toolName === toolName && items[i].status === 'working') {
        items[i] = { ...items[i], status, title }
        return { agentActivity: { ...s.agentActivity, items } }
      }
    }
    // No match — add a terminal item
    const fallback: ActivityItem = { id: `${Date.now()}`, type: 'tool', title, toolName, status, ts: Date.now() }
    return {
      agentActivity: {
        ...s.agentActivity,
        items: [...items, fallback].slice(-MAX_ITEMS),
      },
    }
  }),

  clearActivity: () => set({
    agentActivity: EMPTY_ACTIVITY,
    streamingContent: '',
  }),
}))
