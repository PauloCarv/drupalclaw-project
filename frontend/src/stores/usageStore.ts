import { create } from 'zustand'
import type { TurnStats } from '@/api/usage'

const MAX_TURNS = 20

interface UsageState {
  turns: TurnStats[]
  lastSeenRunAt: string | null
  addTurn: (turn: TurnStats) => void
  clearTurns: () => void
}

export const useUsageStore = create<UsageState>((set, get) => ({
  turns: [],
  lastSeenRunAt: null,

  addTurn: (turn) => {
    if (get().lastSeenRunAt === turn.runAt) return
    set((s) => ({
      turns: [turn, ...s.turns].slice(0, MAX_TURNS),
      lastSeenRunAt: turn.runAt,
    }))
  },

  clearTurns: () => set({ turns: [], lastSeenRunAt: null }),
}))
