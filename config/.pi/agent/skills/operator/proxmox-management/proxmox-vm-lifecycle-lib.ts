/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Shared lifecycle helpers for packaged Proxmox VM scripts.",
 *   "aliases": [
 *     "proxmox vm lifecycle helper"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "inspect",
 *     "start",
 *     "stop",
 *     "resume"
 *   ],
 *   "nouns": [
 *     "helper",
 *     "library"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "vm",
 *     "lifecycle",
 *     "helper",
 *     "library"
 *   ],
 *   "guidance": [
 *     "Helper module used by packaged runnable scripts.",
 *     "Not a direct entrypoint."
 *   ],
 *   "examples": [
 *     "Used by proxmox-start-vm.ts and related entrypoints."
 *   ],
 *   "kind": "read-only",
 *   "weight": "lightweight",
 *   "role": "module"
 * }
 */
import { runProxmoxWorkflow, type ProxmoxApiConfig, type ProxmoxWorkflowName } from "../../../src/proxmox/client.js";

const DEFAULT_BASE_URL = "https://proxmox.example.com:8006/api2/json";
const DEFAULT_TOKEN_KEYCHAIN = "proxmox/piclaw-management-token";

type VmLifecycleWorkflow = Extract<ProxmoxWorkflowName, "vm.inspect" | "vm.start" | "vm.stop" | "vm.resume">;

export interface VmLifecycleDeps {
  runWorkflow?: typeof runProxmoxWorkflow;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

function parsePositiveInteger(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readTimeoutMs(env: NodeJS.ProcessEnv): number | undefined {
  const timeoutSec = parsePositiveInteger(env.PVE_TIMEOUT_SEC);
  return timeoutSec ? timeoutSec * 1000 : undefined;
}

function readAllowInsecureTls(env: NodeJS.ProcessEnv): boolean {
  const raw = env.PVE_ALLOW_INSECURE_TLS ?? env.PICLAW_PROXMOX_ALLOW_INSECURE_TLS;
  if (!raw?.trim()) return true;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function buildVmLifecycleConfig(env: NodeJS.ProcessEnv): ProxmoxApiConfig {
  return {
    base_url: env.PVE_BASE?.trim() || DEFAULT_BASE_URL,
    api_token_keychain: env.PICLAW_PROXMOX_TOKEN_KEYCHAIN?.trim() || DEFAULT_TOKEN_KEYCHAIN,
    allow_insecure_tls: readAllowInsecureTls(env),
  };
}

export async function runVmLifecycleScript(
  workflow: VmLifecycleWorkflow,
  env: NodeJS.ProcessEnv = process.env,
  deps: VmLifecycleDeps = {},
): Promise<number> {
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text));
  const runWorkflow = deps.runWorkflow ?? runProxmoxWorkflow;

  const vmid = parsePositiveInteger(env.PVE_VMID);
  if (!vmid) {
    writeStderr("Missing required env var: PVE_VMID\n");
    return 2;
  }

  try {
    const timeoutMs = readTimeoutMs(env);
    const result = await runWorkflow(buildVmLifecycleConfig(env), {
      workflow,
      vmid,
      ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
      ...(workflow === "vm.stop" && env.PVE_FORCE?.trim() === "1" ? { force: true } : {}),
    });
    writeStdout(`${JSON.stringify(result.result, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
