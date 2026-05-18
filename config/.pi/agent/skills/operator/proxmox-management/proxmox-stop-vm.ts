#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Stop management for a packaged skill.",
 *   "aliases": [
 *     "proxmox stop vm",
 *     "stop vm"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "stop"
 *   ],
 *   "nouns": [
 *     "management"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "stop",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "stop management"
 *   ],
 *   "kind": "mutating",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/** Stop a Proxmox QEMU VM through the shared workflow layer. */

import { runVmLifecycleScript } from "./proxmox-vm-lifecycle-lib.js";

process.exit(await runVmLifecycleScript("vm.stop"));
