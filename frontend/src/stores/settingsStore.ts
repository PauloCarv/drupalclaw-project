import { create } from 'zustand'
import { writeFile } from '@/api/files'

function readInt(key: string, fallback: number): number {
  try { return parseInt(localStorage.getItem(key) ?? '', 10) || fallback } catch { return fallback }
}

function readStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--dc-font-size', `${size}px`)
}

const initialFontSize = readInt('dc-font-size', 14)
applyFontSize(initialFontSize)

const browserTimezone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
})()

interface SettingsState {
  fontSize: number
  setFontSize: (size: number) => void
  scheduleTimezone: string
  setScheduleTimezone: (tz: string) => void
  interactionMode: 'learning' | 'expert'
  setInteractionMode: (mode: 'learning' | 'expert') => void
  autoCompact: boolean
  setAutoCompact: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>(() => ({
  fontSize: initialFontSize,
  setFontSize: (size) => {
    try { localStorage.setItem('dc-font-size', String(size)) } catch { /* no-op */ }
    applyFontSize(size)
    useSettingsStore.setState({ fontSize: size })
  },
  scheduleTimezone: readStr('dc-schedule-tz', browserTimezone),
  setScheduleTimezone: (tz) => {
    try { localStorage.setItem('dc-schedule-tz', tz) } catch { /* no-op */ }
    useSettingsStore.setState({ scheduleTimezone: tz })
  },
  interactionMode: readStr('dc-interaction-mode', 'learning') as 'learning' | 'expert',
  setInteractionMode: (mode) => {
    try { localStorage.setItem('dc-interaction-mode', mode) } catch { /* no-op */ }
    writeFile('.piclaw/user-prefs.json', JSON.stringify({ interaction_mode: mode }, null, 2)).catch(() => {})
    useSettingsStore.setState({ interactionMode: mode })
  },
  autoCompact: readStr('dc-auto-compact', 'true') === 'true',
  setAutoCompact: (value) => {
    try { localStorage.setItem('dc-auto-compact', String(value)) } catch { /* no-op */ }
    useSettingsStore.setState({ autoCompact: value })
  },
}))
