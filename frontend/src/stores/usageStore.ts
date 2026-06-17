import { create } from 'zustand'
import type { TurnStats } from '@/api/usage'

const MAX_TURNS = 50
const STORAGE_KEY = 'drupalclaw-turn-history'

function loadFromStorage(): { turns: TurnStats[]; lastSeenRunAt: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { turns: [], lastSeenRunAt: null }
    const parsed = JSON.parse(raw) as TurnStats[]
    return {
      turns: parsed,
      lastSeenRunAt: parsed[0]?.runAt ?? null,
    }
  } catch {
    return { turns: [], lastSeenRunAt: null }
  }
}

function saveToStorage(turns: TurnStats[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(turns))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

interface UsageState {
  turns: TurnStats[]
  lastSeenRunAt: string | null
  addTurn: (turn: TurnStats) => void
  clearTurns: () => void
}

const initial = loadFromStorage()

export const useUsageStore = create<UsageState>((set, get) => ({
  turns: initial.turns,
  lastSeenRunAt: initial.lastSeenRunAt,

  addTurn: (turn) => {
    if (get().lastSeenRunAt === turn.runAt) return
    const turns = [turn, ...get().turns].slice(0, MAX_TURNS)
    saveToStorage(turns)
    set({ turns, lastSeenRunAt: turn.runAt })
  },

  clearTurns: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ turns: [], lastSeenRunAt: null })
  },
}))
