#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Start management for a packaged skill.",
 *   "aliases": [
 *     "proxmox start vm",
 *     "start vm"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "start"
 *   ],
 *   "nouns": [
 *     "management"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "start",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "start management"
 *   ],
 *   "kind": "mutating",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/** Start a Proxmox QEMU VM through the shared workflow layer. */

import { runVmLifecycleScript } from "./proxmox-vm-lifecycle-lib.js";

process.exit(await runVmLifecycleScript("vm.start"));
