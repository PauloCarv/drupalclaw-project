---
name: reload
description: Reinstall piclaw from workspace source and force-restart the running process. Use after making code changes to piclaw.
distribution: public
---

# Reload Piclaw (force)

Reinstall the piclaw package from workspace source and restart the running process
immediately. The new process takes over on the same port.

> ⚠️ **Important (container runtime):**
> Always install to `/usr/local/lib/bun/install/global/node_modules/piclaw`.
> Do **not** deploy to `/home/agent/.bun/...` in this container, or Supervisor may keep running an older build.

## Steps

Use the repo's canonical Makefile path:

```bash
cd /workspace/piclaw && make local-install
```

This is the authoritative reload/install workflow for this project in the container.
It already does the right thing for this environment:

1. `make build-piclaw` — builds vendor assets, web bundles, and TypeScript
2. `bun pm pack` — creates a tarball from `/workspace/piclaw/runtime`
3. installs the package into the active global Bun runtime under `/usr/local/lib/bun`
4. restarts piclaw using the detected local service manager

### Useful variants

Build only:

```bash
cd /workspace/piclaw && make build-piclaw
```

Build vendor bundle only:

```bash
cd /workspace/piclaw && make vendor
```

Restart only (after install is already done):

```bash
cd /workspace/piclaw && make restart
```

## How It Works

The restart script (`restart-piclaw.sh`) auto-detects the service manager and restarts
piclaw through it. Detection order (first match wins):

| Priority | Check | Method |
|----------|-------|--------|
| 0 | `PICLAW_SERVICE_MANAGER` env var set | Use its value directly (`supervisor`, `systemd`, `manual`) |
| 1 | `supervisorctl` binary exists AND a `piclaw` program is registered | `supervisorctl restart piclaw` |
| 2 | `systemctl` binary exists AND a `piclaw.service` user unit exists | `systemctl --user restart piclaw.service` |
| 3 | Neither found | Manual kill + start fallback |

Before restarting, the script:
1. Waits (up to 120s) for the active agent turn to finish by polling `/agent/status`
2. Queues a `resume_pending` IPC task so interrupted turns can resume after restart

This recovery path is intended to work the same under Supervisor and `systemd --user`: once piclaw is back up, startup recovery plus the IPC watcher use the persisted SQLite + `PICLAW_DATA/ipc/tasks` state to resume pending work.

### Supervisor path (default in Docker containers)

Uses `supervisorctl -c <config> restart piclaw`. The config path is auto-detected:
- `/workspace/.piclaw/supervisor/supervisord.conf` (preferred)
- `/etc/supervisor/supervisord.conf` (fallback)
- Override with `PICLAW_SUPERVISORCTL_CONFIG`

If `supervisorctl` is found but the restart fails, the script **aborts** (exit 1) to avoid
conflicting with Supervisor's own restart logic.

### Systemd --user path (for non-Docker hosts)

Uses `systemctl --user restart piclaw.service`. Override the unit name with
`PICLAW_SYSTEMD_UNIT`.

If the restart fails, the script aborts.

### Manual fallback

Kills the old process (via PID file or `OLD_PID` arg), waits for the port to free up,
and starts `piclaw --port 8080` in a tiny supervisor loop (5 retries). Override the
command with `-- piclaw --port 8080`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PICLAW_SERVICE_MANAGER` | (auto) | Force `supervisor`, `systemd`, or `manual` |
| `PICLAW_SUPERVISOR_SERVICE` | `piclaw` | Supervisor program name |
| `PICLAW_SUPERVISORCTL_BIN` | `supervisorctl` | supervisorctl binary |
| `PICLAW_SUPERVISORCTL_CONFIG` | (auto) | Supervisor config path |
| `PICLAW_SYSTEMD_UNIT` | `piclaw.service` | systemd --user unit name |
| `PICLAW_WEB_PORT` | `8080` | Port to wait for / pass to piclaw |
| `PICLAW_RELOAD_LOG` | `/tmp/restart-piclaw-force.log` | Async log file |
| `PICLAW_RELOAD_ASYNC` | `1` | Set `0` for sync (foreground) mode |

## Important Notes

- Prefer `make local-install` over hand-written pack/install/restart command sequences.
- Bun and piclaw are installed globally under `/usr/local/lib/bun` (root-owned).
- The Makefile delegates restart behavior to the local service-manager-aware flow (`make restart` / `restart-piclaw.sh`).
- WhatsApp session state persists across restarts (stored in SQLite + auth dir).
- Check `/tmp/restart-piclaw-force.log` if something goes wrong.
