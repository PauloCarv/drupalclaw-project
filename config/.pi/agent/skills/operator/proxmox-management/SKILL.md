---
name: proxmox-management
description: Manage Proxmox using the native proxmox tool first, with shell wrappers retained for USB passthrough and backup-restore move flows.
distribution: public
---

# Proxmox Management

Use this skill for Proxmox work when you need:

- native `proxmox` workflow examples for routine infra operations
- shell-oriented wrappers for USB passthrough tasks
- the backup-restore VM move helper when direct migration is blocked by storage constraints

## Scope

This skill is focused on:

- native-tool-first Proxmox operations
- bounded VM/LXC/storage provisioning examples
- ISO/media and VM disk workflow examples
- VM lifecycle wrappers (`qemu`)
- USB discovery on a node
- cluster USB mapping create/update
- USB mapping attach to a VM slot (`usb0`..`usb4`)
- VM move via backup+restore when direct migration is blocked by storage-type constraints

## Setup

Set Proxmox API environment variables first when using the shell wrappers directly.

> Keep examples sanitized in prompts/logs. Use placeholders in documentation and avoid sharing real secrets.

```bash
TOKEN_JSON="$(piclaw keychain get proxmox/piclaw-management-token)"
export PVE_BASE="https://proxmox.example.com:8006/api2/json"
export PVE_TOKEN_USER="$(printf '%s' "$TOKEN_JSON" | jq -r '.username')"
export PVE_TOKEN_SECRET="$(printf '%s' "$TOKEN_JSON" | jq -r '.secret')"
```

If `PVE_TOKEN_USER` / `PVE_TOKEN_SECRET` are omitted, scripts try keychain entry `proxmox/piclaw-management-token`.

## Native tool first

Prefer the native `proxmox` tool for routine work when the session already has a
session-scoped Proxmox profile. Use:

- `action: "request"` for ad-hoc API calls
- `action: "workflow"` for native VM/LXC/storage/task/metrics workflows
- `action: "capabilities"`, `"workflow_help"`, and `"recommend"` to discover the right workflow with low context

Common native workflow examples:

- `workflow: "vm.inspect"`
- `workflow: "vm.create"`
- `workflow: "lxc.create"`
- `workflow: "storage.create"`
- `workflow: "storage.download_url"`
- `workflow: "vm.iso.attach"`
- `workflow: "vm.iso.detach"`
- `workflow: "vm.disk.resize"`
- `workflow: "vm.disk.detach"`
- `workflow: "vm.disk.remove"`
- `workflow: "backup.restore"`
- `workflow: "metrics.node"`
- `workflow: "metrics.vm"`
- `workflow: "metrics.storage"`

Use the shell scripts below only when a shell-oriented wrapper is more convenient
or when working with the remaining skill-specific flows.

## Scripts

The old packaged `runtime/scripts/proxmox.ts` helper was removed once the native
session-scoped `proxmox` tool became the canonical path. The wrappers in this
skill directory call the shared runtime Proxmox client/workflow layer directly so
node resolution, task polling, guest-IP lookup, metrics retrieval, and keychain-backed
API access stay centralized without a duplicate repo-level CLI.

Wrappers in this skill directory:

- `proxmox-vm-status.ts` (delegates to `vm inspect`)
- `proxmox-start-vm.ts`
- `proxmox-stop-vm.ts`
- `proxmox-resume-vm.ts`
- `proxmox-list-usb.ts`
- `proxmox-upsert-usb-mapping.ts`
- `proxmox-attach-usb-mapping-to-vm.ts`
- `proxmox-move-vm-via-backup-restore.ts`

## Common workflows

### 1) Inspect or create a VM with the native tool

Use the native tool when the session already has a Proxmox profile:

- inspect an existing VM: `workflow: "vm.inspect"`
- create a VM: `workflow: "vm.create"`
- attach installer media: `workflow: "vm.iso.attach"`
- grow or remove a disk: `workflow: "vm.disk.resize"` / `"vm.disk.remove"`

When you are unsure which fields are needed, prefer:

- `action: "recommend"` with a short intent
- `action: "workflow_help"` for the selected workflow

### 2) Download public ISO media into storage

Use the native workflow:

- `workflow: "storage.download_url"`

This is a server-side Proxmox pull into storage, so it avoids agent-side file upload.

### 3) Check VM status/config with the wrapper

```bash
export PVE_VMID="<vmid>"
bun ./proxmox-vm-status.ts
```

### 4) Start/stop/resume VM with wrappers

```bash
export PVE_VMID="<vmid>"
bun ./proxmox-start-vm.ts
# or
bun ./proxmox-stop-vm.ts
# or
bun ./proxmox-resume-vm.ts
```

### 5) Find Bluetooth USB dongles on a node

```bash
export PVE_NODE="<node>"
export PVE_USB_BLUETOOTH_ONLY=1
bun ./proxmox-list-usb.ts
```

Optional filters:

- `PVE_USB_VENDORID` (e.g. `0a12`)
- `PVE_USB_PRODID` (e.g. `0001`)
- `PVE_USB_CLASS` (e.g. `224` or `e0`)

### 6) Upsert USB mapping + attach to VM

Prefer mapping-based attach with API tokens.

```bash
# Create/update mapping
export PVE_MAPPING_ID="vm117-bt"
export PVE_MAPPING_MAP="node=<node>,id=<vendorid>:<prodid>"
bun ./proxmox-upsert-usb-mapping.ts

# Attach mapping to VM usb0
export PVE_NODE="<node>"
export PVE_VMID="<vmid>"
export PVE_USB_MAPPING_ID="vm117-bt"
export PVE_USB_SLOT="usb0"
bun ./proxmox-attach-usb-mapping-to-vm.ts
```

### 7) Move VM across nodes/storage via backup+restore

Use when direct migration fails due to incompatible storage types.

```bash
export PVE_SOURCE_NODE="<source-node>"
export PVE_VMID="<vmid>"
export PVE_TARGET_NODE="<target-node>"
export PVE_TARGET_STORAGE="<target-storage>"

# optional
export PVE_BACKUP_STORAGE="backup"
export PVE_BACKUP_MODE="stop"
export PVE_DELETE_SOURCE="0"   # set to 1 to remove source after backup

bun ./proxmox-move-vm-via-backup-restore.ts
```

## Notes and limitations

- With token auth, direct `usbX=host=VID:PID` may be rejected by Proxmox ACL checks.
- Mapping path (`usbX=mapping=<id>`) is the safe default for token-based automation.
- If guest-level confirmation is needed, use QEMU guest agent endpoints after attach.
- The skill-local wrappers auto-discover the VM node from cluster resources for VM lifecycle actions, so `PVE_NODE` is no longer required for the basic status/start/stop/resume wrappers.
- Interactive console/session flows are still outside the current request/response runtime model and belong to the v2 streaming/session backlog.
