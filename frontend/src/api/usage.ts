import { getAgentContext } from './providers'

export interface TurnStats {
  runAt: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costTotal: number
  cacheHitRate: number
  model: string
  provider: string
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costTotal: number
  cacheHitRate: number
  runs: number
}

export interface UsageData {
  latest: TurnStats | null
  totals: UsageTotals | null
}

export async function getUsageData(): Promise<UsageData> {
  const ctx = await getAgentContext()
  const cu = ctx?.cacheUsage
  if (!cu) return { latest: null, totals: null }

  const latest: TurnStats | null = cu.latest
    ? {
        runAt: cu.latest.runAt ?? '',
        inputTokens: cu.latest.inputTokens ?? 0,
        outputTokens: cu.latest.outputTokens ?? 0,
        cacheReadTokens: cu.latest.cacheReadTokens ?? 0,
        cacheWriteTokens: cu.latest.cacheWriteTokens ?? 0,
        totalTokens: cu.latest.totalTokens ?? 0,
        costTotal: cu.latest.costTotal ?? 0,
        cacheHitRate: cu.latest.cacheHitRate ?? 0,
        model: cu.latest.model ?? '',
        provider: cu.latest.provider ?? '',
      }
    : null

  const totals: UsageTotals | null = cu.totals
    ? {
        inputTokens: cu.totals.inputTokens ?? 0,
        outputTokens: cu.totals.outputTokens ?? 0,
        cacheReadTokens: cu.totals.cacheReadTokens ?? 0,
        cacheWriteTokens: cu.totals.cacheWriteTokens ?? 0,
        totalTokens: cu.totals.totalTokens ?? 0,
        costTotal: cu.totals.costTotal ?? 0,
        cacheHitRate: cu.totals.cacheHitRate ?? 0,
        runs: cu.totals.runs ?? 0,
      }
    : null

  return { latest, totals }
}

// ── Environmental impact estimates ──────────────────────────────
// Based on: ~0.005 kWh per 1000 tokens (server inference average)
// Carbon: 0.233 kg CO2/kWh (EU grid average, IEA 2023)
// Water: 1.8 L/kWh (data center cooling average)
// Only "fresh" tokens count — cache reads bypass LLM computation.

const KWH_PER_1K_TOKENS = 0.005
const KG_CO2_PER_KWH = 0.233
const LITERS_WATER_PER_KWH = 1.8
// 1 mature tree sequesters ~21 kg CO2/year = ~57.5 g/day = ~2.4 g/hour
const G_CO2_PER_TREE_DAY = 21_000 / 365

export function computeEnvironmentalImpact(totals: UsageTotals) {
  const freshTokens =
    totals.inputTokens + totals.outputTokens + totals.cacheWriteTokens

  const freshWithoutCache =
    totals.inputTokens + totals.outputTokens +
    totals.cacheWriteTokens + totals.cacheReadTokens

  const kwhActual = (freshTokens / 1000) * KWH_PER_1K_TOKENS
  const kwhWithoutCache = (freshWithoutCache / 1000) * KWH_PER_1K_TOKENS

  const co2ActualG = kwhActual * KG_CO2_PER_KWH * 1000
  const co2WithoutCacheG = kwhWithoutCache * KG_CO2_PER_KWH * 1000
  const co2SavedG = co2WithoutCacheG - co2ActualG

  const waterActualMl = kwhActual * LITERS_WATER_PER_KWH * 1000
  const waterSavedMl = (kwhWithoutCache - kwhActual) * LITERS_WATER_PER_KWH * 1000

  // Tree-days: how many days of a tree's sequestration the cache savings represent
  const treeDaysSaved = co2SavedG / G_CO2_PER_TREE_DAY

  return {
    freshTokens,
    freshWithoutCache,
    co2ActualG,
    co2SavedG,
    waterActualMl,
    waterSavedMl,
    treeDaysSaved,
  }
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.001) return `$${usd.toFixed(5)}`
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

export function fmtGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`
  if (g >= 1) return `${g.toFixed(1)} g`
  return `${(g * 1000).toFixed(0)} mg`
}

export function fmtMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(2)} L`
  return `${ml.toFixed(0)} mL`
}
