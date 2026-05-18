#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Attach management mapping to for a packaged skill.",
 *   "aliases": [
 *     "proxmox attach usb mapping to vm",
 *     "attach usb mapping to vm"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "vm",
 *     "usb",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "attach"
 *   ],
 *   "nouns": [
 *     "management",
 *     "mapping",
 *     "to"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "attach",
 *     "usb",
 *     "mapping",
 *     "to",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "attach management mapping to"
 *   ],
 *   "kind": "mutating",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/**
 * Attach a Proxmox USB mapping to a QEMU VM slot (usb0 by default).
 *
 * Required env:
 * - PVE_NODE
 * - PVE_VMID
 * - PVE_USB_MAPPING_ID
 *
 * Optional env:
 * - PVE_USB_SLOT (default: usb0)
 * - PVE_BASE (default: https://proxmox.example.com:8006/api2/json)
 * - PVE_TOKEN_USER / PVE_TOKEN_SECRET (fallback keychain)
 * - PVE_WAIT_TIMEOUT_SEC (default: 120)
 */

type Token = { username: string; secret: string };

type ApiJson = { data?: any; message?: string };

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

async function api(base: string, token: Token, path: string, init?: RequestInit): Promise<ApiJson> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `PVEAPIToken=${token.username}=${token.secret}`,
      ...(init?.headers || {}),
    },
    tls: { rejectUnauthorized: false },
  });

  const t = await r.text();
  let j: ApiJson = {};
  try {
    j = JSON.parse(t || "{}");
  } catch {
    j = { message: t };
  }

  if (!r.ok) throw new Error(`API ${r.status} ${path}: ${j.message || t}`);
  return j;
}

async function waitTask(
  base: string,
  token: Token,
  node: string,
  upid: string,
  timeoutSec = 120,
): Promise<{ status?: string; exitstatus?: string }> {
  const start = Date.now();
  const path = `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`;

  while (true) {
    const st = await api(base, token, path);
    const d = (st.data || {}) as { status?: string; exitstatus?: string };
    if (d.status === "stopped") return d;
    if ((Date.now() - start) / 1000 > timeoutSec) throw new Error(`Timed out waiting for task ${upid}`);
    await Bun.sleep(1500);
  }
}

const node = (process.env.PVE_NODE || "").trim();
const vmid = (process.env.PVE_VMID || "").trim();
const mapping = (process.env.PVE_USB_MAPPING_ID || "").trim();
const slot = (process.env.PVE_USB_SLOT || "usb0").trim();

if (!node || !vmid || !mapping) {
  console.error("Missing required env vars: PVE_NODE, PVE_VMID, PVE_USB_MAPPING_ID");
  process.exit(2);
}

if (!/^usb[0-4]$/.test(slot)) {
  console.error("PVE_USB_SLOT must be usb0..usb4");
  process.exit(2);
}

const base = process.env.PVE_BASE || "https://proxmox.example.com:8006/api2/json";
const timeoutSec = Number(process.env.PVE_WAIT_TIMEOUT_SEC || "120");
const token = getToken();

const params = new URLSearchParams();
params.set(slot, `mapping=${mapping}`);

const setResp = await api(base, token, `/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}/config`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params,
});

const upid = String(setResp.data || "");
if (upid.startsWith("UPID:")) {
  const result = await waitTask(base, token, node, upid, timeoutSec);
  if (result.exitstatus !== "OK") {
    throw new Error(`Config task failed: ${result.exitstatus || "unknown"}`);
  }
}

const cfg = await api(base, token, `/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}/config`);
const monitor = await api(base, token, `/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}/monitor`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ command: "info usb" }),
});

console.log(
  JSON.stringify(
    {
      node,
      vmid,
      slot,
      configured: cfg.data?.[slot] || null,
      monitor_usb: monitor.data || "",
    },
    null,
    2,
  ),
);
