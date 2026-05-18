#!/usr/bin/env bun
/**
 * SCRIPT_JDOC:
 * {
 *   "summary": "Resume management for a packaged skill.",
 *   "aliases": [
 *     "proxmox resume vm",
 *     "resume vm"
 *   ],
 *   "domains": [
 *     "proxmox",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "verbs": [
 *     "resume"
 *   ],
 *   "nouns": [
 *     "management"
 *   ],
 *   "keywords": [
 *     "proxmox",
 *     "management",
 *     "resume",
 *     "vm",
 *     "virtualization"
 *   ],
 *   "guidance": [
 *     "Runnable script entrypoint.",
 *     "Packaged script surface."
 *   ],
 *   "examples": [
 *     "resume management"
 *   ],
 *   "kind": "mutating",
 *   "weight": "lightweight",
 *   "role": "entrypoint"
 * }
 */
/** Resume a Proxmox QEMU VM through the shared workflow layer. */

import { runVmLifecycleScript } from "./proxmox-vm-lifecycle-lib.js";

process.exit(await runVmLifecycleScript("vm.resume"));
