#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Generate power output for a packaged skill.",
 *   "aliases": [
 *     "graphite power chart",
 *     "power chart"
 *   ],
 *   "domains": [
 *     "graphite",
 *     "metrics"
 *   ],
 *   "verbs": [
 *     "generate"
 *   ],
 *   "nouns": [
 *     "power"
 *   ],
 *   "keywords": [
 *     "graphite",
 *     "power",
 *     "chart",
 *     "metrics"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "generate power"
 *   ],
 *   "kind": "mixed",
 *   "weight": "standard",
 *   "role": "entrypoint"
 * }
 */
/**
 * skills/graphite-power-chart/graphite-power-chart.ts – Generates a Graphite metric chart.
 *
 * Standalone script invoked by the graphite-power-chart skill. Fetches time-
 * series data from a Graphite server for a specified Zigbee device metric,
 * generates an SVG line chart, and writes it as an IPC file for the web
 * timeline.
 *
 * CLI args:
 *   --graphite-url <url>  Graphite server base URL
 *   --target <metric>     Graphite metric target string
 *   --from <time>         Start time (default: -12h)
 *   --title <text>        Chart title
 *   --ipc-dir <dir>       IPC output directory
 *   --width <px>          Chart width (default: 720)
 *   --height <px>         Chart height (default: 300)
 *
 * Consumers: Invoked via /skill:graphite-power-chart.
 */

import { mkdirSync, writeFileSync } from "fs";
import { basename, join } from "path";

const args = process.argv.slice(2);

const getArg = (name: string): string | undefined => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) {
    const value = args[idx + 1];
    if (!value.startsWith("--")) return value;
  }
  return undefined;
};

const hoursArg = getArg("--hours");
const hours = hoursArg ? parseInt(hoursArg, 10) : 12;
const targetHours = Number.isFinite(hours) && hours > 0 ? hours : 12;

const baseUrlArg = getArg("--base-url");
const baseUrl = (baseUrlArg || "http://192.168.1.250:8086").replace(/\/$/, "");

const deviceArg = getArg("--device");
const metricArg = getArg("--metric");
const labelArg = getArg("--label");
const unitArg = getArg("--unit");

if (!deviceArg && !metricArg) {
  console.error("Usage: graphite-power-chart.ts --device <name> [--hours 12] [--resample 5min|raw] [--label Power] [--unit W] [--ipc] [--chat-jid web:default]");
  process.exit(1);
}

let metric = metricArg || deviceArg || "";
if (!metricArg) {
  if (!metric.startsWith("zigbee.")) metric = `zigbee.${metric}`;
  if (!metric.endsWith(".power")) metric = `${metric}.power`;
}

const displayName = metric.replace(/^zigbee\./, "");
const inferLabel = () => {
  if (labelArg) return labelArg;
  if (metric.endsWith(".power")) return "Power";
  if (metric.endsWith(".temperature")) return "Temperature";
  if (metric.endsWith(".humidity")) return "Humidity";
  if (metric.endsWith(".voltage")) return "Voltage";
  if (metric.endsWith(".current")) return "Current";
  return "Value";
};
const inferUnit = () => {
  if (unitArg) return unitArg;
  if (metric.endsWith(".power")) return "W";
  if (metric.endsWith(".temperature")) return "°C";
  if (metric.endsWith(".humidity")) return "%";
  if (metric.endsWith(".voltage")) return "V";
  if (metric.endsWith(".current")) return "A";
  return "";
};
const seriesLabel = inferLabel();
const unit = inferUnit();
const unitSuffix = unit ? ` ${unit}` : "";

const ipcEnabled = args.includes("--ipc");
const nudgeEnabled = args.includes("--nudge");
const chatJid = getArg("--chat-jid") || process.env.PICLAW_CHAT_JID || "web:default";
const dataDir = process.env.PICLAW_DATA || "/workspace/.piclaw/data";
const messagesDir = join(dataDir, "ipc", "messages");
const mediaDir = join(dataDir, "ipc", "media");

const chooseResamplePeriod = (hours: number): string => {
  if (hours <= 3) return "1min";
  if (hours <= 6) return "2min";
  if (hours <= 12) return "5min";
  if (hours <= 24) return "10min";
  if (hours <= 48) return "30min";
  if (hours <= 72) return "1h";
  return "2h";
};

const resampleArg = getArg("--resample");
const resamplePeriod = resampleArg === "raw" ? null : resampleArg || chooseResamplePeriod(targetHours);
const targetMetric = resamplePeriod
  ? `summarize(${metric},\"${resamplePeriod}\",\"avg\")`
  : metric;

const from = `-${targetHours}h`;
const url = `${baseUrl}/render?target=${encodeURIComponent(targetMetric)}&from=${from}&format=json`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`Graphite request failed (${res.status}): ${url}`);
  process.exit(1);
}

const payload = (await res.json()) as Array<{ target: string; datapoints: Array<[number | null, number]> }>;
const series = payload?.[0];
const datapoints = series?.datapoints || [];
const points = datapoints
  .filter((pt) => pt[0] !== null)
  .map((pt) => ({ value: pt[0] as number, ts: pt[1] * 1000 }))
  .sort((a, b) => a.ts - b.ts);

if (!points.length) {
  const msg = `No data for ${displayName} (last ${targetHours}h).`;
  if (ipcEnabled) {
    mkdirSync(messagesDir, { recursive: true });
    const outPath = join(messagesDir, `msg_${Date.now()}_graphite_power.json`);
    writeFileSync(outPath, JSON.stringify({ type: "message", chatJid, text: msg, noNudge: !nudgeEnabled }, null, 2));
  } else {
    process.stdout.write(msg);
  }
  process.exit(0);
}

const rawValues = points.map((p) => p.value);
const rawMax = Math.max(...rawValues);
const zeroThreshold = Math.max(0.001, rawMax * 0.001);
let trimmedPoints = points;
for (let i = points.length - 1; i >= 0; i -= 1) {
  if (Math.abs(points[i].value) > zeroThreshold) {
    if (i < points.length - 1) {
      trimmedPoints = points.slice(0, i + 1);
    }
    break;
  }
}
if (!trimmedPoints.length) trimmedPoints = points;

const values = trimmedPoints.map((p) => p.value);
const minValue = Math.min(...values);
const maxValue = Math.max(...values);
const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
const lastValue = values[values.length - 1];

const formatValue = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};
const formatValueWithUnit = (value: number): string => `${formatValue(value)}${unitSuffix}`;

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

const chooseHourStep = (hours: number): number => {
  const candidates = [1, 2, 3, 4, 6, 8, 12, 24];
  let best = candidates[0];
  let bestScore = Infinity;
  for (const step of candidates) {
    const ticks = Math.floor(hours / step) + 1;
    const score = Math.abs(ticks - 5);
    if (score < bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return best;
};

const now = Date.now();
const startTs = now - targetHours * 3600 * 1000;
const endTs = now;

const width = 680;
const height = 240;
const padding = { left: 48, right: 16, top: 28, bottom: 42 };
const chartWidth = width - padding.left - padding.right;
const chartHeight = height - padding.top - padding.bottom;
const minAxisRaw = Math.min(0, minValue);
const maxAxisRaw = Math.max(1, maxValue);
const { min: minAxis, max: maxAxis, ticks: yTicks } = buildTicks(minAxisRaw, maxAxisRaw, 5);
const range = maxAxis - minAxis || 1;

const xStepHours = chooseHourStep(targetHours);
const xStepMs = xStepHours * 3600 * 1000;
const firstTick = Math.ceil(startTs / xStepMs) * xStepMs;
const xTicks: number[] = [];
for (let t = firstTick; t <= endTs + 1; t += xStepMs) {
  xTicks.push(t);
}

const scaleX = (ts: number) =>
  padding.left + ((ts - startTs) / (endTs - startTs)) * chartWidth;
const scaleY = (value: number) =>
  padding.top + ((maxAxis - value) / range) * chartHeight;

const linePath = trimmedPoints
  .map((p, idx) => `${idx === 0 ? "M" : "L"}${scaleX(p.ts).toFixed(1)} ${scaleY(p.value).toFixed(1)}`)
  .join(" ");

const baseY = padding.top + chartHeight;
const firstX = scaleX(trimmedPoints[0].ts);
const lastX = scaleX(trimmedPoints[trimmedPoints.length - 1].ts);
const areaPath = `${linePath} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`;

const title = `${seriesLabel} last ${targetHours}h • avg ${formatValue(avgValue)}${unitSuffix}`;
const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const yGrid = yTicks
  .map((value) => {
    const y = scaleY(value);
    return `<line class="grid" x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" />`;
  })
  .join("\n  ");

const yTicksMarks = yTicks
  .map((value) => {
    const y = scaleY(value);
    return `<line class="tick" x1="${(padding.left - 4).toFixed(1)}" y1="${y.toFixed(1)}" x2="${padding.left.toFixed(1)}" y2="${y.toFixed(1)}" />`;
  })
  .join("\n  ");

const yLabels = yTicks
  .map((value) => {
    const y = scaleY(value);
    return `<text class="label" x="${padding.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${formatValueWithUnit(value)}</text>`;
  })
  .join("\n  ");

const xGrid = xTicks
  .map((ts) => {
    const x = scaleX(ts);
    return `<line class="grid" x1="${x.toFixed(1)}" y1="${padding.top}" x2="${x.toFixed(1)}" y2="${padding.top + chartHeight}" />`;
  })
  .join("\n  ");

const xTicksMarks = xTicks
  .map((ts) => {
    const x = scaleX(ts);
    return `<line class="tick" x1="${x.toFixed(1)}" y1="${(padding.top + chartHeight).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(padding.top + chartHeight + 4).toFixed(1)}" />`;
  })
  .join("\n  ");

const xLabels = xTicks
  .map((ts) => {
    const x = scaleX(ts);
    return `<text class="label" x="${x.toFixed(1)}" y="${height - 16}" text-anchor="middle">${timeLabel(ts)}</text>`;
  })
  .join("\n  ");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">
  <style>
    svg { --text: #0f1419; --grid: #e5e7eb; --tick: #94a3b8; --line: #1d9bf0; --fill: rgba(29,155,240,0.12); --muted: #536471; }
    @media (prefers-color-scheme: dark) {
      svg { --text: #e7e9ea; --grid: #2a2d32; --tick: #5f666d; --line: #1d9bf0; --fill: rgba(29,155,240,0.18); --muted: #71767b; }
    }
    .title { font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; fill: var(--text); }
    .label { font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; fill: var(--muted); }
    .axis { stroke: var(--grid); stroke-width: 1.2; }
    .grid { stroke: var(--grid); stroke-width: 1.2; stroke-dasharray: 4 4; opacity: 0.6; vector-effect: non-scaling-stroke; }
    .tick { stroke: var(--tick); stroke-width: 1.4; vector-effect: non-scaling-stroke; }
    .line { fill: none; stroke: var(--line); stroke-width: 2; }
    .area { fill: var(--fill); }
  </style>
  <text class="title" x="${padding.left}" y="18">${seriesLabel} • ${displayName} • last ${targetHours}h</text>
  <path class="area" d="${areaPath}" />
  ${yGrid}
  ${xGrid}
  <path class="line" d="${linePath}" />
  <line class="axis" x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" />
  <line class="axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" />
  ${yTicksMarks}
  ${xTicksMarks}
  ${yLabels}
  ${xLabels}
</svg>`;

const resampleLabel = resamplePeriod ? ` (avg @ ${resamplePeriod})` : "";
const summaryLines = [
  `${seriesLabel} for ${displayName} — last ${targetHours}h${resampleLabel}`,
  `Avg ${formatValueWithUnit(avgValue)} • Min ${formatValueWithUnit(minValue)} • Max ${formatValueWithUnit(maxValue)} • Last ${formatValueWithUnit(lastValue)}`,
];

const message = summaryLines.join("\n");

if (ipcEnabled) {
  mkdirSync(messagesDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });
  const svgPath = join(mediaDir, `graphite-power-${Date.now()}.svg`);
  writeFileSync(svgPath, svg, "utf8");
  const outPath = join(messagesDir, `msg_${Date.now()}_graphite_power.json`);
  const payloadOut = {
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
  writeFileSync(outPath, JSON.stringify(payloadOut, null, 2));
  process.stdout.write(outPath);
} else {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  process.stdout.write([`![power-chart](${dataUrl})`, "", ...summaryLines].join("\n"));
}
