#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Generate token usage output for a packaged skill.",
 *   "aliases": [
 *     "token chart",
 *     "chart"
 *   ],
 *   "domains": [
 *     "token",
 *     "usage"
 *   ],
 *   "verbs": [
 *     "generate"
 *   ],
 *   "nouns": [
 *     "token",
 *     "usage"
 *   ],
 *   "keywords": [
 *     "token",
 *     "chart",
 *     "usage"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "generate token usage"
 *   ],
 *   "kind": "mixed",
 *   "weight": "standard",
 *   "role": "entrypoint"
 * }
 */
/**
 * skills/token-chart/token-chart.ts – Generates a 7-day token usage chart.
 *
 * Standalone script invoked by the token-chart skill (via IPC or scheduler).
 * Reads token_usage data from the SQLite database, aggregates it into daily
 * buckets by model/provider, generates an SVG bar chart, and writes it as
 * an IPC file so piclaw posts it to the web timeline.
 *
 * CLI args:
 *   --days <n>           Number of days to chart (default: 7)
 *   --sessions-dir <dir> Path to sessions directory
 *   --ipc-dir <dir>      Path to IPC directory for output
 *   --store-dir <dir>    Path to piclaw store directory (for DB)
 *   --width <px>         Chart width in pixels (default: 720)
 *
 * Consumers: Scheduled by task-scheduler.ts or invoked manually via /skill:token-chart.
 */

import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { basename, dirname, join } from "path";
import Database from "bun:sqlite";
import { generateProviderModelChart } from "./token-usage-by-provider-model-chart";

const args = process.argv.slice(2);
const daysArgIndex = args.indexOf("--days");
const days = daysArgIndex >= 0 ? parseInt(args[daysArgIndex + 1], 10) : 7;
const targetDays = Number.isFinite(days) && days > 0 ? days : 7;

const sessionsArgIndex = args.indexOf("--sessions-dir");
const sessionsCandidate = sessionsArgIndex >= 0 ? args[sessionsArgIndex + 1] : undefined;
const sessionsDir = sessionsCandidate && !sessionsCandidate.startsWith("--")
  ? sessionsCandidate
  : "/workspace/.piclaw/data/sessions";

const sourceArgIndex = args.indexOf("--source");
const sourceCandidate = sourceArgIndex >= 0 ? args[sourceArgIndex + 1] : undefined;
const source = sourceCandidate && !sourceCandidate.startsWith("--") ? sourceCandidate : "db";
const useSessions = source === "sessions" || sessionsArgIndex >= 0;

const modeArgIndex = args.indexOf("--mode");
const modeCandidate = modeArgIndex >= 0 ? args[modeArgIndex + 1] : undefined;
const chartMode = modeCandidate && !modeCandidate.startsWith("--") ? modeCandidate : "default";
const isProviderModelMode = ["provider-model", "provider-model-chart", "provider-model-alt"].includes(chartMode);

if (chartMode !== "default" && chartMode !== "provider-model" && chartMode !== "provider-model-chart" && chartMode !== "provider-model-alt") {
  console.warn(`[token-chart] Unknown mode: ${chartMode}. Falling back to default chart.`);
}

const ipcEnabled = args.includes("--ipc");
const nudgeEnabled = args.includes("--nudge");
const chatJidIndex = args.indexOf("--chat-jid");
const chatJidCandidate = chatJidIndex >= 0 ? args[chatJidIndex + 1] : undefined;
const chatJid = chatJidCandidate && !chatJidCandidate.startsWith("--")
  ? chatJidCandidate
  : process.env.PICLAW_CHAT_JID || "web:default";
const dataDir = process.env.PICLAW_DATA || "/workspace/.piclaw/data";
const messagesDir = join(dataDir, "ipc", "messages");
const mediaDir = join(dataDir, "ipc", "media");
const outputSvgArgIndex = args.indexOf("--output-svg");
const outputSvgCandidate = outputSvgArgIndex >= 0 ? args[outputSvgArgIndex + 1] : undefined;
const outputSvg = outputSvgCandidate && !outputSvgCandidate.startsWith("--") ? outputSvgCandidate : undefined;
const storeDir = process.env.PICLAW_STORE || "/workspace/.piclaw/store";
const dbPath = join(storeDir, "messages.db");

const now = new Date();
const start = new Date(now);
start.setHours(0, 0, 0, 0);
start.setDate(start.getDate() - (targetDays - 1));

const dayKeys: string[] = [];
const dayDates: Date[] = [];
const totals = new Map<string, number>();
const inputs = new Map<string, number>();
const outputs = new Map<string, number>();
const cacheReads = new Map<string, number>();
const cacheWrites = new Map<string, number>();
const costs = new Map<string, number>();
const normalTotals = new Map<string, number>();
const normalCacheReads = new Map<string, number>();
const normalCacheWrites = new Map<string, number>();
const autoresearchTotals = new Map<string, number>();
const autoresearchCacheReads = new Map<string, number>();
const autoresearchCacheWrites = new Map<string, number>();

type UsageBucket = "normal" | "autoresearch";

const pad = (n: number) => n.toString().padStart(2, "0");
const formatKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatCompact = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    const fixed = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
    return `${fixed.replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    const scaled = value / 1_000;
    const fixed = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
    return `${fixed.replace(/\.0$/, "")}K`;
  }
  return value.toString();
};

const formatDayLocalLabel = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${dayNames[d.getDay()]} ${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function runProviderModelMode() {
  const result = generateProviderModelChart({
    days: targetDays,
    dbPath,
    now,
  });

  const total = Math.round(result.totalTokens);

  const summaryLines = [
    `Alternative chart (provider + model): last ${targetDays} days • ${formatCompact(total)} tokens across ${result.seriesCount} series`,
    ...result.dayTotals.map((point) => `• ${formatDayLocalLabel(point.day)}: ${formatCompact(point.total)} tokens`),
  ];

  const message = summaryLines.join("\n");
  if (outputSvg) {
    mkdirSync(dirname(outputSvg), { recursive: true });
    writeFileSync(outputSvg, result.svg, "utf8");
  }
  if (ipcEnabled) {
    mkdirSync(messagesDir, { recursive: true });
    mkdirSync(mediaDir, { recursive: true });
    const svgPath = outputSvg || join(mediaDir, `token-chart-provider-model-${Date.now()}.svg`);
    if (!outputSvg) writeFileSync(svgPath, result.svg, "utf8");
    const outPath = join(messagesDir, `msg_${Date.now()}_tokenchart.json`);
    const payload = {
      type: "message",
      chatJid,
      text: message,
      noNudge: !nudgeEnabled,
      media: [
        {
          path: svgPath,
          content_type: "image/svg+xml",
          filename: basename(svgPath),
          inline: true,
        },
      ],
    };
    writeFileSync(outPath, JSON.stringify(payload, null, 2));
    process.stdout.write(outPath);
  } else {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(result.svg).toString("base64")}`;
    process.stdout.write([`![token-chart](${dataUrl})`, "", ...summaryLines].join("\n"));
  }
}

if (isProviderModelMode) {
  runProviderModelMode();
  process.exit(0);
}

for (let i = 0; i < targetDays; i += 1) {
  const d = new Date(start);
  d.setDate(start.getDate() + i);
  const key = formatKey(d);
  dayKeys.push(key);
  dayDates.push(d);
  totals.set(key, 0);
  inputs.set(key, 0);
  outputs.set(key, 0);
  cacheReads.set(key, 0);
  cacheWrites.set(key, 0);
  costs.set(key, 0);
  normalTotals.set(key, 0);
  normalCacheReads.set(key, 0);
  normalCacheWrites.set(key, 0);
  autoresearchTotals.set(key, 0);
  autoresearchCacheReads.set(key, 0);
  autoresearchCacheWrites.set(key, 0);
}

const inRange = (d: Date) => d >= start && d <= now;

function classifyUsageBucket(sourceValue: unknown): UsageBucket {
  return typeof sourceValue === "string" && sourceValue.trim() === "autoresearch"
    ? "autoresearch"
    : "normal";
}

function addTokens(
  ts: Date,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  totalTokens: number,
  costTotal: number,
  bucket: UsageBucket = "normal"
) {
  if (!ts || Number.isNaN(ts.getTime()) || !inRange(ts)) return;
  const key = formatKey(ts);
  if (!totals.has(key)) return;

  totals.set(key, (totals.get(key) || 0) + totalTokens);
  inputs.set(key, (inputs.get(key) || 0) + input);
  outputs.set(key, (outputs.get(key) || 0) + output);
  cacheReads.set(key, (cacheReads.get(key) || 0) + cacheRead);
  cacheWrites.set(key, (cacheWrites.get(key) || 0) + cacheWrite);
  costs.set(key, (costs.get(key) || 0) + costTotal);

  const bucketTotals = bucket === "autoresearch" ? autoresearchTotals : normalTotals;
  const bucketCacheReads = bucket === "autoresearch" ? autoresearchCacheReads : normalCacheReads;
  const bucketCacheWrites = bucket === "autoresearch" ? autoresearchCacheWrites : normalCacheWrites;
  bucketTotals.set(key, (bucketTotals.get(key) || 0) + totalTokens);
  bucketCacheReads.set(key, (bucketCacheReads.get(key) || 0) + cacheRead);
  bucketCacheWrites.set(key, (bucketCacheWrites.get(key) || 0) + cacheWrite);
}

function addUsage(record: any) {
  if (!record || record.type !== "message") return;
  const msg = record.message;
  if (!msg || msg.role !== "assistant" || !msg.usage) return;

  let ts: Date | null = null;
  if (record.timestamp) {
    ts = typeof record.timestamp === "string" || typeof record.timestamp === "number" ? new Date(record.timestamp) : null;
  }
  if (!ts || Number.isNaN(ts.getTime())) {
    if (msg.timestamp) {
      ts = new Date(msg.timestamp);
    }
  }
  if (!ts || Number.isNaN(ts.getTime())) return;

  const usage = msg.usage || {};
  const input = typeof usage.input === "number" ? usage.input : 0;
  const output = typeof usage.output === "number" ? usage.output : 0;
  const cacheRead = typeof usage.cacheRead === "number" ? usage.cacheRead : 0;
  const cacheWrite = typeof usage.cacheWrite === "number" ? usage.cacheWrite : 0;
  const totalTokens =
    (typeof usage.totalTokens === "number" && usage.totalTokens) ||
    (typeof usage.total === "number" && usage.total) ||
    input + output + cacheRead + cacheWrite;

  const costObj = usage.cost || {};
  const costTotal =
    (typeof costObj.total === "number" && costObj.total) ||
    (typeof costObj.input === "number" ? costObj.input : 0) +
      (typeof costObj.output === "number" ? costObj.output : 0) +
      (typeof costObj.cacheRead === "number" ? costObj.cacheRead : 0) +
      (typeof costObj.cacheWrite === "number" ? costObj.cacheWrite : 0);

  const sourceValue =
    typeof record?.source === "string"
      ? record.source
      : (typeof msg?.metadata?.source === "string" ? msg.metadata.source : null);

  addTokens(ts, input, output, cacheRead, cacheWrite, totalTokens, costTotal, classifyUsageBucket(sourceValue));
}

function scanFile(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      addUsage(record);
    } catch {
      // ignore malformed line
    }
  }
}

function walk(dir: string) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full);
    } else if (stat.isFile() && entry.endsWith(".jsonl")) {
      scanFile(full);
    }
  }
}

function loadFromDb(): boolean {
  if (!existsSync(dbPath)) return false;
  let db: Database | null = null;
  try {
    db = new Database(dbPath);
    db.exec("PRAGMA busy_timeout = 5000;");
    const startIso = start.toISOString();
    const endIso = now.toISOString();
    const tokenUsageColumns = db.prepare("PRAGMA table_info(token_usage)").all() as Array<{ name?: string }>;
    const hasSourceColumn = tokenUsageColumns.some((column) => column.name === "source");
    const rows = db
      .query(
        `SELECT run_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens,
                cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
                ${hasSourceColumn ? "source" : "NULL AS source"}
         FROM token_usage
         WHERE run_at >= ? AND run_at <= ?`
      )
      .all(startIso, endIso) as Array<Record<string, any>>;

    for (const row of rows) {
      const ts = row.run_at ? new Date(row.run_at) : null;
      if (!ts || Number.isNaN(ts.getTime())) continue;

      const input = typeof row.input_tokens === "number" ? row.input_tokens : 0;
      const output = typeof row.output_tokens === "number" ? row.output_tokens : 0;
      const cacheRead = typeof row.cache_read_tokens === "number" ? row.cache_read_tokens : 0;
      const cacheWrite = typeof row.cache_write_tokens === "number" ? row.cache_write_tokens : 0;
      const totalTokens = typeof row.total_tokens === "number" ? row.total_tokens : input + output + cacheRead + cacheWrite;
      const costTotal =
        (typeof row.cost_total === "number" && row.cost_total) ||
        (typeof row.cost_input === "number" ? row.cost_input : 0) +
          (typeof row.cost_output === "number" ? row.cost_output : 0) +
          (typeof row.cost_cache_read === "number" ? row.cost_cache_read : 0) +
          (typeof row.cost_cache_write === "number" ? row.cost_cache_write : 0);

      addTokens(ts, input, output, cacheRead, cacheWrite, totalTokens, costTotal, classifyUsageBucket(row.source));
    }
    return true;
  } catch (err) {
    console.warn("[token-chart] Failed to read token_usage; falling back to sessions.", err);
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

const loadedFromDb = !useSessions ? loadFromDb() : false;
if (useSessions || !loadedFromDb) {
  walk(sessionsDir);
}

const values = dayKeys.map((key) => totals.get(key) || 0);
const cachedValues = dayKeys.map((key) => (cacheReads.get(key) || 0) + (cacheWrites.get(key) || 0));
const uncachedValues = values.map((total, idx) => Math.max(total - cachedValues[idx], 0));
const normalValues = dayKeys.map((key) => normalTotals.get(key) || 0);
const normalCachedValues = dayKeys.map((key) => (normalCacheReads.get(key) || 0) + (normalCacheWrites.get(key) || 0));
const normalUncachedValues = normalValues.map((total, idx) => Math.max(total - normalCachedValues[idx], 0));
const autoresearchValues = dayKeys.map((key) => autoresearchTotals.get(key) || 0);
const autoresearchCachedValues = dayKeys.map((key) => (autoresearchCacheReads.get(key) || 0) + (autoresearchCacheWrites.get(key) || 0));
const autoresearchUncachedValues = autoresearchValues.map((total, idx) => Math.max(total - autoresearchCachedValues[idx], 0));
const rawMaxValue = Math.max(0, ...values);
const sumValue = values.reduce((a, b) => a + b, 0);
const sumInput = dayKeys.reduce((acc, key) => acc + (inputs.get(key) || 0), 0);
const sumOutput = dayKeys.reduce((acc, key) => acc + (outputs.get(key) || 0), 0);
const sumCacheRead = dayKeys.reduce((acc, key) => acc + (cacheReads.get(key) || 0), 0);
const sumCacheWrite = dayKeys.reduce((acc, key) => acc + (cacheWrites.get(key) || 0), 0);
const sumCost = dayKeys.reduce((acc, key) => acc + (costs.get(key) || 0), 0);
const cachedTotal = sumCacheRead + sumCacheWrite;
const cachedPct = sumValue > 0 ? Math.round((cachedTotal / sumValue) * 1000) / 10 : 0;
const normalTotal = normalValues.reduce((acc, value) => acc + value, 0);
const normalCachedTotal = normalCachedValues.reduce((acc, value) => acc + value, 0);
const normalUncachedTotal = normalUncachedValues.reduce((acc, value) => acc + value, 0);
const autoresearchTotal = autoresearchValues.reduce((acc, value) => acc + value, 0);
const autoresearchCachedTotal = autoresearchCachedValues.reduce((acc, value) => acc + value, 0);
const autoresearchUncachedTotal = autoresearchUncachedValues.reduce((acc, value) => acc + value, 0);
void uncachedValues;
void sumCost;

const niceNumber = (value: number, round: boolean): number => {
  if (value === 0) return 0;
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const fraction = Math.abs(value) / Math.pow(10, exponent);
  let niceFraction = 1;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
};

const buildTicks = (min: number, max: number, tickCount: number) => {
  const range = niceNumber(max - min || 1, false);
  const step = niceNumber(range / Math.max(1, tickCount - 1), true) || 1;
  const graphMin = Math.floor(min / step) * step;
  const graphMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = graphMin; v <= graphMax + step / 2; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return { min: graphMin, max: graphMax, ticks, step };
};

const width = 680;
const height = 252;
const padding = { left: 48, right: 16, top: 40, bottom: 42 };
const chartWidth = width - padding.left - padding.right;
const chartHeight = height - padding.top - padding.bottom;
const step = chartWidth / targetDays;
const gap = Math.min(12, step * 0.2);
const barWidth = Math.max(12, step - gap);
const { max: maxAxis, ticks: yTicks } = buildTicks(0, Math.max(1, rawMaxValue), 5);
const scaleY = (value: number) => padding.top + (chartHeight - (value / maxAxis) * chartHeight);

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const label = (key: string) => key.slice(5);
const labelLong = (d: Date) => `${dayNames[d.getDay()]} ${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function buildCombinedStackRects(x: number, dayIndex: number, dayKey: string): string {
  const segments = [
    {
      value: normalCachedValues[dayIndex] || 0,
      className: "bar-normal-cached",
      title: `${dayKey} • normal cached ${formatCompact(normalCachedValues[dayIndex] || 0)}`,
    },
    {
      value: autoresearchCachedValues[dayIndex] || 0,
      className: "bar-autoresearch-cached",
      title: `${dayKey} • autoresearch cached ${formatCompact(autoresearchCachedValues[dayIndex] || 0)}`,
    },
    {
      value: normalUncachedValues[dayIndex] || 0,
      className: "bar-normal-uncached",
      title: `${dayKey} • normal uncached ${formatCompact(normalUncachedValues[dayIndex] || 0)}`,
    },
    {
      value: autoresearchUncachedValues[dayIndex] || 0,
      className: "bar-autoresearch-uncached",
      title: `${dayKey} • autoresearch uncached ${formatCompact(autoresearchUncachedValues[dayIndex] || 0)}`,
    },
  ];

  let cumulative = 0;
  const rects: string[] = [];
  for (const segment of segments) {
    if (!segment.value) continue;
    const y0 = padding.top + (chartHeight - (cumulative / maxAxis) * chartHeight);
    const next = cumulative + segment.value;
    const y1 = padding.top + (chartHeight - (next / maxAxis) * chartHeight);
    const heightPx = Math.max(1, y0 - y1);
    rects.push(`<rect class="bar ${segment.className}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${heightPx.toFixed(1)}" rx="4"><title>${segment.title}</title></rect>`);
    cumulative = next;
  }
  return rects.join("\n  ");
}

const bars = dayKeys.map((key, i) => {
  const x = padding.left + i * step + gap / 2;
  return buildCombinedStackRects(x, i, key);
});

const labels = dayKeys.map((key, i) => {
  const x = padding.left + i * step + step / 2;
  const y = height - 16;
  return `<text class="label" x="${x.toFixed(1)}" y="${y}" text-anchor="middle">${label(key)}</text>`;
});

const yBottom = padding.top + chartHeight;
const axisX = `<line class="axis" x1="${padding.left}" y1="${yBottom}" x2="${width - padding.right}" y2="${yBottom}" />`;
const axisY = `<line class="axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${yBottom}" />`;
const yGrid = yTicks
  .filter((value) => value > 0)
  .map((value) => {
    const y = scaleY(value);
    return `<line class="grid" x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" />`;
  })
  .join("\n  ");
const yTickMarks = yTicks
  .map((value) => {
    const y = scaleY(value);
    return `<line class="tick" x1="${(padding.left - 4).toFixed(1)}" y1="${y.toFixed(1)}" x2="${padding.left.toFixed(1)}" y2="${y.toFixed(1)}" />`;
  })
  .join("\n  ");
const xTickMarks = dayKeys.map((_, i) => {
  const x = padding.left + i * step + step / 2;
  return `<line class="tick" x1="${x.toFixed(1)}" y1="${yBottom.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(yBottom + 4).toFixed(1)}" />`;
});
const yLabels = yTicks
  .map((value) => {
    const y = scaleY(value);
    return `<text class="label" x="${padding.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${formatCompact(value)}</text>`;
  })
  .join("\n  ");

const title = `Tokens last ${targetDays} days • total ${formatCompact(sumValue)}`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">
  <style>
    svg { --text: #0f1419; --grid: #e8ebed; --tick: #cbd5e1; --normal-uncached: #1d9bf0; --normal-cached: #2ecc71; --autoresearch-uncached: #8b5cf6; --autoresearch-cached: #f59e0b; --muted: #536471; }
    @media (prefers-color-scheme: dark) {
      svg { --text: #e7e9ea; --grid: #2f3336; --tick: #4b5563; --normal-uncached: #4aa8ff; --normal-cached: #34d399; --autoresearch-uncached: #a78bfa; --autoresearch-cached: #fbbf24; --muted: #71767b; }
    }
    .title { font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; fill: var(--text); }
    .label { font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; fill: var(--muted); }
    .axis { stroke: var(--grid); stroke-width: 1.2; }
    .grid { stroke: var(--grid); stroke-width: 1; stroke-dasharray: 4 4; opacity: 0.8; vector-effect: non-scaling-stroke; }
    .tick { stroke: var(--tick); stroke-width: 1.2; vector-effect: non-scaling-stroke; }
    .bar-normal-uncached { fill: var(--normal-uncached); }
    .bar-normal-cached { fill: var(--normal-cached); }
    .bar-autoresearch-uncached { fill: var(--autoresearch-uncached); }
    .bar-autoresearch-cached { fill: var(--autoresearch-cached); }
  </style>
  <text class="title" x="${padding.left}" y="18">${title}</text>
  <rect x="${width - padding.right - 310}" y="6" width="10" height="10" fill="var(--normal-uncached)" rx="2" />
  <text class="label" x="${width - padding.right - 294}" y="15">normal uncached</text>
  <rect x="${width - padding.right - 155}" y="6" width="10" height="10" fill="var(--normal-cached)" rx="2" />
  <text class="label" x="${width - padding.right - 139}" y="15">normal cached</text>
  <rect x="${width - padding.right - 310}" y="20" width="10" height="10" fill="var(--autoresearch-uncached)" rx="2" />
  <text class="label" x="${width - padding.right - 294}" y="29">autoresearch uncached</text>
  <rect x="${width - padding.right - 155}" y="20" width="10" height="10" fill="var(--autoresearch-cached)" rx="2" />
  <text class="label" x="${width - padding.right - 139}" y="29">autoresearch cached</text>
  ${bars.join("\n  ")}
  ${yGrid}
  ${axisX}
  ${axisY}
  ${yTickMarks}
  ${xTickMarks.join("\n  ")}
  ${yLabels}
  ${labels.join("\n  ")}
</svg>`;

if (outputSvg) {
  mkdirSync(dirname(outputSvg), { recursive: true });
  writeFileSync(outputSvg, svg, "utf8");
}

const summaryLines = [
  `Token usage (all chats) — last ${targetDays} days, total ${formatCompact(sumValue)}`,
  `Input ${formatCompact(sumInput)} • Output ${formatCompact(sumOutput)} • Cache read ${formatCompact(sumCacheRead)} • Cache write ${formatCompact(sumCacheWrite)} (${cachedPct}% cached)`,
  `Normal ${formatCompact(normalTotal)} tokens • cached ${formatCompact(normalCachedTotal)} • uncached ${formatCompact(normalUncachedTotal)}`,
  `Autoresearch ${formatCompact(autoresearchTotal)} tokens • cached ${formatCompact(autoresearchCachedTotal)} • uncached ${formatCompact(autoresearchUncachedTotal)}`,
  ...dayDates.map((d, i) => {
    return `• ${labelLong(d)}: ${formatCompact(values[i])} tokens (normal ${formatCompact(normalValues[i] || 0)}: cached ${formatCompact(normalCachedValues[i] || 0)}, uncached ${formatCompact(normalUncachedValues[i] || 0)}; autoresearch ${formatCompact(autoresearchValues[i] || 0)}: cached ${formatCompact(autoresearchCachedValues[i] || 0)}, uncached ${formatCompact(autoresearchUncachedValues[i] || 0)})`;
  }),
];

const message = summaryLines.join("\n");

if (ipcEnabled) {
  mkdirSync(messagesDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });

  const svgPath = outputSvg || join(mediaDir, `token-chart-${Date.now()}.svg`);
  if (!outputSvg) {
    writeFileSync(svgPath, svg, "utf8");
  }

  const outPath = join(messagesDir, `msg_${Date.now()}_tokenchart.json`);
  const payload = {
    type: "message",
    chatJid,
    text: message,
    noNudge: !nudgeEnabled,
    media: [
      {
        path: svgPath,
        content_type: "image/svg+xml",
        filename: basename(svgPath),
        inline: true,
      },
    ],
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  process.stdout.write(outPath);
} else {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  process.stdout.write([`![token-chart](${dataUrl})`, "", ...summaryLines].join("\n"));
}
