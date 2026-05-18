import { create } from 'zustand'
import type { ChatMessage, ChatSession } from '@/api/chat'

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  isAgentRunning: boolean
  streamingContent: string
  streamingStartedAt: number | null

  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  setStreaming: (streaming: boolean) => void
  setAgentRunning: (running: boolean) => void
  setStreamingStartedAt: (ts: number | null) => void
  appendStreamContent: (chunk: string) => void
  clearStreamContent: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  isStreaming: false,
  isAgentRunning: false,
  streamingContent: '',
  streamingStartedAt: null,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setAgentRunning: (isAgentRunning) => set({ isAgentRunning }),
  setStreamingStartedAt: (streamingStartedAt) => set({ streamingStartedAt }),
  appendStreamContent: (chunk) => set((state) => ({ streamingContent: state.streamingContent + chunk })),
  clearStreamContent: () => set({ streamingContent: '' }),
}))
