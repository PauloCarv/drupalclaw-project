import { create } from 'zustand'

function readInt(key: string, fallback: number): number {
  try { return parseInt(localStorage.getItem(key) ?? '', 10) || fallback } catch { return fallback }
}

function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--dc-font-size', `${size}px`)
}

const initialFontSize = readInt('dc-font-size', 14)
applyFontSize(initialFontSize)

interface SettingsState {
  fontSize: number
  setFontSize: (size: number) => void
}

export const useSettingsStore = create<SettingsState>(() => ({
  fontSize: initialFontSize,
  setFontSize: (size) => {
    try { localStorage.setItem('dc-font-size', String(size)) } catch { /* no-op */ }
    applyFontSize(size)
    useSettingsStore.setState({ fontSize: size })
  },
}))
