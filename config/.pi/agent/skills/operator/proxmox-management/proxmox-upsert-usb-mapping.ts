#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Upsert management mapping for a packaged skill.",
 *   "aliases": [
 *     "proxmox upsert usb mapping",
 *     "upsert usb mapping"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "usb",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "upsert"
 *   ],
 *   "nouns": [
 *     "management",
 *     "mapping"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "upsert",
 *     "usb",
 *     "mapping",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "upsert management mapping"
 *   ],
 *   "kind": "mutating",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/**
 * Create or update a Proxmox USB mapping.
 *
 * Required env:
 * - PVE_MAPPING_ID
 * - PVE_MAPPING_MAP (single mapping string, e.g. node=borg,id=0a12:0001)
 *   OR
 * - PVE_MAPPING_MAPS_JSON (JSON array of mapping strings)
 *
 * Optional env:
 * - PVE_BASE (default: https://proxmox.example.com:8006/api2/json)
 * - PVE_TOKEN_USER / PVE_TOKEN_SECRET (fallback keychain)
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

async function api(
  base: string,
  token: Token,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: ApiJson; raw: string }> {
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

  return { status: r.status, body: j, raw: t };
}

function mappingList(): string[] {
  const single = (process.env.PVE_MAPPING_MAP || "").trim();
  const json = (process.env.PVE_MAPPING_MAPS_JSON || "").trim();

  if (json) {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string")) {
      throw new Error("PVE_MAPPING_MAPS_JSON must be a JSON string array");
    }
    return parsed.map((x) => x.trim()).filter(Boolean);
  }

  if (single) {
    return single
      .split(/\r?\n|;/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  throw new Error("Provide PVE_MAPPING_MAP or PVE_MAPPING_MAPS_JSON");
}

const id = (process.env.PVE_MAPPING_ID || "").trim();
if (!id) {
  console.error("Missing required env var: PVE_MAPPING_ID");
  process.exit(2);
}

const maps = mappingList();
if (!maps.length) {
  console.error("No mapping rows provided");
  process.exit(2);
}

const base = process.env.PVE_BASE || "https://proxmox.example.com:8006/api2/json";
const token = getToken();

const existsResp = await api(base, token, `/cluster/mapping/usb/${encodeURIComponent(id)}`);
const exists =
  existsResp.status === 200 &&
  !!existsResp.body.data &&
  !String(existsResp.body.message || "").toLowerCase().includes("not found");

const params = new URLSearchParams();
for (const row of maps) params.append("map", row);

let op: "create" | "update";
let reqPath: string;
let method: "POST" | "PUT";

if (exists) {
  op = "update";
  reqPath = `/cluster/mapping/usb/${encodeURIComponent(id)}`;
  method = "PUT";
} else {
  op = "create";
  reqPath = "/cluster/mapping/usb";
  method = "POST";
  params.set("id", id);
}

const apply = await api(base, token, reqPath, {
  method,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params,
});

if (apply.status < 200 || apply.status >= 300) {
  throw new Error(`API ${apply.status} ${reqPath}: ${apply.body.message || apply.raw}`);
}

const verify = await api(base, token, `/cluster/mapping/usb/${encodeURIComponent(id)}`);
if (verify.status !== 200 || !verify.body.data) {
  throw new Error(`Failed to verify mapping ${id}: ${verify.body.message || verify.raw}`);
}

console.log(
  JSON.stringify(
    {
      operation: op,
      id,
      map: (verify.body.data.map || []) as string[],
      digest: verify.body.data.digest || null,
    },
    null,
    2,
  ),
);
