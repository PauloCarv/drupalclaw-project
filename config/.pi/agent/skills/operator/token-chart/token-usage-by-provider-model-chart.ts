#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Generate by provider model output for a packaged skill.",
 *   "aliases": [
 *     "token usage by provider model chart",
 *     "usage by provider model chart"
 *   ],
 *   "domains": [
 *     "token",
 *     "usage"
 *   ],
 *   "verbs": [
 *     "generate"
 *   ],
 *   "nouns": [
 *     "by",
 *     "provider",
 *     "model"
 *   ],
 *   "keywords": [
 *     "token",
 *     "chart",
 *     "usage",
 *     "by",
 *     "provider",
 *     "model"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "generate by provider model"
 *   ],
 *   "kind": "mixed",
 *   "weight": "standard",
 *   "role": "entrypoint"
 * }
 */
/**
 * token-usage-by-provider-model-chart.ts
 *
 * Generates a stacked SVG chart of token usage grouped by provider + model.
 * Intended as an internal helper for the token-chart skill (`--mode provider-model`).
 */

import { existsSync } from "fs";
import Database from "bun:sqlite";

export interface ProviderModelChartDataPoint {
  day: string;
  total: number;
}

export interface ProviderModelChartResult {
  svg: string;
  csv: string;
  dayTotals: ProviderModelChartDataPoint[];
  seriesCount: number;
  totalTokens: number;
}

function formatCompact(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${n}`;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  let nice = 1;
  if (fraction <= 1) nice = 1;
  else if (fraction <= 2) nice = 2;
  else if (fraction <= 5) nice = 5;
  else nice = 10;
  return nice * exponent;
}

function splitSeriesKey(key: `${string} / ${string}`): { provider: string; model: string } {
  const [provider, ...rest] = key.split(" / ");
  return { provider, model: rest.join(" / ") || "(unknown)" };
}

function compareProviderNames(a: string, b: string): number {
  const order = ["github-copilot", "openai-codex", "azure-openai", "azure-foundry", "(unknown)"];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai >= 0 && bi >= 0 && ai !== bi) return ai - bi;
  if (ai >= 0 && bi < 0) return -1;
  if (bi >= 0 && ai < 0) return 1;
  return a.localeCompare(b);
}

export function generateProviderModelChart(options: {
  days?: number;
  dbPath?: string;
  now?: Date;
}): ProviderModelChartResult {
  const daysArg = Number.parseInt(String(options.days ?? 7), 10);
  const days = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 7;
  const dbPath = options.dbPath ?? "/workspace/.piclaw/store/messages.db";
  const now = options.now ?? new Date();

  const startDay = new Date(now);
  startDay.setUTCHours(0, 0, 0, 0);
  startDay.setUTCDate(startDay.getUTCDate() - (days - 1));

  const dayKeys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(startDay);
    d.setUTCDate(startDay.getUTCDate() + i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const emptyResult: ProviderModelChartResult = {
    svg: `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1700" height="860" viewBox="0 0 1700 860"><style>.title{font:700 28px system-ui,-apple-system,Segoe UI,sans-serif;fill:#f8fafc;}.subtitle{font:400 14px system-ui,-apple-system,Segoe UI,sans-serif;fill:#94a3b8;}</style><rect fill="#0b1020" x="0" y="0" width="1700" height="860" rx="18"/><text class="title" x="90" y="42">Token usage by provider + model — last ${days} days</text><text class="subtitle" x="90" y="64">No rows found.</text></svg>`,
    csv: `day,provider,model,tokens\n${dayKeys.map((day) => `${day},(none),(none),0`).join("\n")}`,
    dayTotals: dayKeys.map((day) => ({ day, total: 0 })),
    seriesCount: 0,
    totalTokens: 0,
  };

  if (!existsSync(dbPath)) {
    return emptyResult;
  }

  const db = new Database(dbPath, { readonly: true });

  type SeriesKey = `${string} / ${string}`;
  const rows = db
    .query(
      `SELECT substr(run_at,1,10) AS day,
              COALESCE(provider,'(unknown)') AS provider,
              COALESCE(model,'(unknown)') AS model,
              SUM(COALESCE(total_tokens,0)) AS tokens
       FROM token_usage
       WHERE run_at >= ?
       GROUP BY day, COALESCE(provider,'(unknown)'), COALESCE(model,'(unknown)')
       ORDER BY day, tokens DESC`
    )
    .all(`${dayKeys[0]}T00:00:00Z`) as Array<{
    day: string;
    provider: string;
    model: string;
    tokens: number;
  }>;

  db.close();

  const seriesSet = new Set<SeriesKey>();
  const totalsBySeries = new Map<SeriesKey, number>();

  for (const row of rows) {
    const key = `${row.provider} / ${row.model}` as SeriesKey;
    seriesSet.add(key);
    totalsBySeries.set(key, (totalsBySeries.get(key) || 0) + Number(row.tokens || 0));
  }

  const series = Array.from(seriesSet).sort((a, b) => {
    const left = splitSeriesKey(a);
    const right = splitSeriesKey(b);
    const byProvider = compareProviderNames(left.provider, right.provider);
    if (byProvider !== 0) return byProvider;
    const byTotal = (totalsBySeries.get(b) || 0) - (totalsBySeries.get(a) || 0);
    if (byTotal !== 0) return byTotal;
    return left.model.localeCompare(right.model);
  });

  const values = new Map<string, Map<SeriesKey, number>>();
  for (const day of dayKeys) {
    values.set(day, new Map(series.map((key) => [key, 0])));
  }

  for (const row of rows) {
    const day = row.day;
    const key = `${row.provider} / ${row.model}` as SeriesKey;
    values.get(day)?.set(key, Number(row.tokens || 0));
  }

  const totalsByDay = new Map<string, number>();
  for (const day of dayKeys) {
    let total = 0;
    for (const key of series) {
      total += values.get(day)?.get(key) || 0;
    }
    totalsByDay.set(day, total);
  }

  const maxDayTotal = Math.max(0, ...Array.from(totalsByDay.values()));
  const yMax = Math.ceil(niceMax(maxDayTotal * 1.15 || 1));

  const providerBaseHue: Record<string, number> = {
    "github-copilot": 215,
    "openai-codex": 12,
    "azure-openai": 280,
    "azure-foundry": 150,
    "(unknown)": 0,
  };

  const colors = new Map<SeriesKey, string>();
  const providerSeries = new Map<string, SeriesKey[]>();
  for (const key of series) {
    const { provider } = splitSeriesKey(key);
    const group = providerSeries.get(provider) || [];
    group.push(key);
    providerSeries.set(provider, group);
  }
  for (const [provider, keys] of providerSeries) {
    const baseHue = providerBaseHue[provider] ?? 0;
    const count = keys.length;
    keys.forEach((key, index) => {
      const ratio = count <= 1 ? 0 : index / (count - 1);
      const sat = 78 - ratio * 18;
      const light = 46 + ratio * 24;
      colors.set(key, `hsl(${baseHue.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%)`);
    });
  }

  const width = 1700;
  const marginLeft = 90;
  const marginRight = 50;
  const marginTop = 80;
  const chartHeight = 670;
  const legendTop = marginTop + chartHeight + 80;
  const plotX0 = marginLeft;
  const plotY0 = marginTop;
  const plotY1 = marginTop + chartHeight;
  const chartWidth = width - marginLeft - marginRight;
  const barWidth = 120;
  const barGap = days > 1 ? (chartWidth - barWidth * days) / (days - 1) : 0;
  const legendCols = 3;
  const legendWidth = chartWidth;
  const colGap = 24;
  const colWidth = (legendWidth - colGap * (legendCols - 1)) / legendCols;
  const rowHeight = 22;
  const legendRows = Math.ceil(series.length / legendCols);
  const legendHeight = legendRows * rowHeight;
  const height = legendTop + legendHeight + 60;

  const svg = new Array<string>();
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  svg.push(`<style>
  .bg { fill: #0b1020; }
  .title { font: 700 28px system-ui, -apple-system, Segoe UI, sans-serif; fill: #f8fafc; }
  .subtitle { font: 400 14px system-ui, -apple-system, Segoe UI, sans-serif; fill: #94a3b8; }
  .axis { stroke: #334155; stroke-width: 1; }
  .grid { stroke: #1e293b; stroke-width: 1; }
  .tick { font: 12px system-ui, -apple-system, Segoe UI, sans-serif; fill: #94a3b8; }
  .xlabel { font: 12px system-ui, -apple-system, Segoe UI, sans-serif; fill: #cbd5e1; }
  .toplabel { font: 12px system-ui, -apple-system, Segoe UI, sans-serif; fill: #e2e8f0; }
  .legend-title { font: 600 16px system-ui, -apple-system, Segoe UI, sans-serif; fill: #f8fafc; }
  .legend-text { font: 13px system-ui, -apple-system, Segoe UI, sans-serif; fill: #cbd5e1; }
  .legend-sub { font: 12px system-ui, -apple-system, Segoe UI, sans-serif; fill: #94a3b8; }
  .note { font: 11px system-ui, -apple-system, Segoe UI, sans-serif; fill: #64748b; }
</style>`);
  svg.push(`<rect class="bg" x="0" y="0" width="${width}" height="${height}" rx="18"/>`);
  svg.push(`<text class="title" x="${marginLeft}" y="42">Token usage by provider + model — last ${days} days</text>`);
  svg.push(`<text class="subtitle" x="${marginLeft}" y="64">Legend below plot • provider hues with per-model lightness gradients • UTC dates</text>`);

  for (let i = 0; i <= 5; i += 1) {
    const value = (yMax * i) / 5;
    const y = plotY1 - chartHeight * (value / yMax);
    svg.push(`<line class="grid" x1="${plotX0}" y1="${y.toFixed(1)}" x2="${plotX0 + chartWidth}" y2="${y.toFixed(1)}"/>`);
    svg.push(`<text class="tick" x="${marginLeft - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${formatCompact(value)}</text>`);
  }
  svg.push(`<line class="axis" x1="${plotX0}" y1="${plotY1}" x2="${plotX0 + chartWidth}" y2="${plotY1}"/>`);
  svg.push(`<line class="axis" x1="${plotX0}" y1="${plotY0}" x2="${plotX0}" y2="${plotY1}"/>`);

  for (let dayIndex = 0; dayIndex < dayKeys.length; dayIndex += 1) {
    const day = dayKeys[dayIndex];
    const x = plotX0 + dayIndex * (barWidth + barGap);
    let cumulative = 0;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const key = series[i];
      const value = values.get(day)?.get(key) || 0;
      if (value <= 0) continue;
      const y0 = plotY1 - chartHeight * (cumulative / yMax);
      const next = cumulative + value;
      const y1 = plotY1 - chartHeight * (next / yMax);
      const heightPx = Math.max(1, y0 - y1);
      svg.push(
        `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${barWidth}" height="${heightPx.toFixed(1)}" fill="${colors.get(key)}"><title>${day} • ${key} • ${value.toLocaleString()} tokens</title></rect>`
      );
      cumulative = next;
    }
    const dayDate = new Date(`${day}T00:00:00Z`);
    const label = dayDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
    svg.push(`<text class="xlabel" x="${(x + barWidth / 2).toFixed(1)}" y="${plotY1 + 22}" text-anchor="middle">${label}</text>`);
    const totalLabelY = plotY1 - chartHeight * ((totalsByDay.get(day) || 0) / yMax) - 8;
    const totalLabel = (totalsByDay.get(day) || 0) > 0 ? formatCompact(totalsByDay.get(day) || 0) : "0";
    svg.push(`<text class="toplabel" x="${(x + barWidth / 2).toFixed(1)}" y="${totalLabelY.toFixed(1)}" text-anchor="middle">${totalLabel}</text>`);
  }

  svg.push(`<text class="legend-title" x="${marginLeft}" y="${legendTop - 22}">Provider / model</text>`);
  svg.push(`<text class="legend-sub" x="${marginLeft}" y="${legendTop - 4}">7-day total tokens</text>`);

  const legendSwatchSize = 12;
  const legendLabelXOffset = 20;
  const legendValueWidth = 54;
  const legendGap = 10;
  const legendLabelWidth = Math.min(colWidth - legendLabelXOffset - legendValueWidth - legendGap, 250);

  for (let i = 0; i < series.length; i += 1) {
    const col = i % legendCols;
    const row = Math.floor(i / legendCols);
    const x = marginLeft + col * (colWidth + colGap);
    const itemTop = legendTop + row * rowHeight;
    const swatchY = itemTop + 2;
    const textY = itemTop + 15;
    const key = series[i];
    const { provider, model } = splitSeriesKey(key);
    const labelText = `${provider} / ${model}`;
    const label = labelText.length > 32 ? `${labelText.slice(0, 31)}…` : labelText;
    const valueX = x + legendLabelXOffset + legendLabelWidth + legendGap + legendValueWidth;
    svg.push(`<rect x="${x}" y="${swatchY}" width="${legendSwatchSize}" height="${legendSwatchSize}" rx="2" fill="${colors.get(key)}"/>`);
    svg.push(`<text class="legend-text" x="${x + legendLabelXOffset}" y="${textY}">${label}</text>`);
    svg.push(`<text class="legend-sub" x="${valueX}" y="${textY}" text-anchor="end">${formatCompact(totalsBySeries.get(key) || 0)}</text>`);
  }

  const total7d = Array.from(totalsByDay.values()).reduce((sum, value) => sum + value, 0);
  svg.push(`<text class="note" x="${marginLeft}" y="${height - 28}">Total over ${days} days: ${total7d.toLocaleString()} tokens • Series: ${series.length}</text>`);
  svg.push(`</svg>`);

  const csvLines = ["day,provider,model,tokens"];
  for (const day of dayKeys) {
    for (const key of series) {
      const [provider, model] = key.split(" / ");
      csvLines.push(`${day},${JSON.stringify(provider)},${JSON.stringify(model)},${values.get(day)?.get(key) || 0}`);
    }
  }

  return {
    svg: svg.join(""),
    csv: `${csvLines.join("\n")}\n`,
    dayTotals: dayKeys.map((day) => ({ day, total: totalsByDay.get(day) || 0 })),
    seriesCount: series.length,
    totalTokens: total7d,
  };
}
