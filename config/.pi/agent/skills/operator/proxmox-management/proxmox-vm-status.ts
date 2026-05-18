#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Inspect management for a packaged skill.",
 *   "aliases": [
 *     "proxmox vm status",
 *     "vm status"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "inspect"
 *   ],
 *   "nouns": [
 *     "management"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "vm",
 *     "status",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "inspect management"
 *   ],
 *   "kind": "read-only",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/** Inspect a Proxmox QEMU VM through the shared workflow layer. */

import { runVmLifecycleScript } from "./proxmox-vm-lifecycle-lib.js";

process.exit(await runVmLifecycleScript("vm.inspect"));
