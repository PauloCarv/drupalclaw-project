import { create } from 'zustand'

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
}))
