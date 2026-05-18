#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "List management for a packaged skill.",
 *   "aliases": [
 *     "proxmox list usb",
 *     "list usb"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "usb",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "list"
 *   ],
 *   "nouns": [
 *     "management"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "list",
 *     "usb",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "list management"
 *   ],
 *   "kind": "read-only",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/**
 * List USB devices visible on a Proxmox node.
 *
 * Required env:
 * - PVE_NODE
 *
 * Optional env:
 * - PVE_BASE (default: https://proxmox.example.com:8006/api2/json)
 * - PVE_TOKEN_USER / PVE_TOKEN_SECRET (fallback: keychain proxmox/piclaw-management-token)
 * - PVE_USB_BLUETOOTH_ONLY=1
 * - PVE_USB_VENDORID (e.g. 0a12)
 * - PVE_USB_PRODID (e.g. 0001)
 * - PVE_USB_CLASS (decimal or hex, e.g. 224 or e0)
 */

type Token = { username: string; secret: string };

type UsbRow = {
  busnum?: number;
  devnum?: number;
  port?: number;
  usbpath?: string;
  vendid?: string;
  prodid?: string;
  class?: number;
  level?: number;
  speed?: string;
  manufacturer?: string;
  product?: string;
};

function getToken(): Token {
  const u = process.env.PVE_TOKEN_USER;
  const s = process.env.PVE_TOKEN_SECRET;
  if (u && s) return { username: u, secret: s };

  const out = Bun.spawnSync(["piclaw", "keychain", "get", "proxmox/piclaw-management-token"]);
  if (out.exitCode !== 0) throw new Error(`token fetch failed: ${out.stderr.toString()}`);
  const parsed = JSON.parse(out.stdout.toString());
  if (!parsed?.username || !parsed?.secret) throw new Error("invalid keychain token payload");
  return { username: parsed.username, secret: parsed.secret };
}

async function api(base: string, token: Token, path: string) {
  const r = await fetch(`${base}${path}`, {
    headers: { Authorization: `PVEAPIToken=${token.username}=${token.secret}` },
    tls: { rejectUnauthorized: false },
  });
  const t = await r.text();
  let j: any = {};
  try {
    j = JSON.parse(t || "{}");
  } catch {
    j = { message: t };
  }
  if (!r.ok) throw new Error(`API ${r.status} ${path}: ${j.message || t}`);
  return j;
}

function parseClass(input?: string): number | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("0x")) return Number.parseInt(trimmed.slice(2), 16);
  if (/^[0-9a-f]+$/.test(trimmed) && /[a-f]/.test(trimmed)) return Number.parseInt(trimmed, 16);
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

const node = process.env.PVE_NODE;
if (!node) {
  console.error("Missing required env var: PVE_NODE");
  process.exit(2);
}

const base = process.env.PVE_BASE || "https://proxmox.example.com:8006/api2/json";
const token = getToken();
const bluetoothOnly = process.env.PVE_USB_BLUETOOTH_ONLY === "1";
const filterVid = (process.env.PVE_USB_VENDORID || "").toLowerCase();
const filterPid = (process.env.PVE_USB_PRODID || "").toLowerCase();
const filterClass = parseClass(process.env.PVE_USB_CLASS);

const j = await api(base, token, `/nodes/${encodeURIComponent(node)}/hardware/usb`);
const rows: UsbRow[] = (j.data || []) as UsbRow[];

const filtered = rows.filter((r) => {
  const vid = String(r.vendid || "").toLowerCase();
  const pid = String(r.prodid || "").toLowerCase();
  const cls = Number(r.class ?? -1);

  if (bluetoothOnly && cls !== 0xe0) return false; // Wireless Controller (Bluetooth class commonly e0)
  if (filterVid && vid !== filterVid) return false;
  if (filterPid && pid !== filterPid) return false;
  if (filterClass !== null && cls !== filterClass) return false;

  return true;
});

console.log(
  JSON.stringify(
    {
      node,
      total: rows.length,
      filtered: filtered.length,
      rows: filtered,
    },
    null,
    2,
  ),
);
