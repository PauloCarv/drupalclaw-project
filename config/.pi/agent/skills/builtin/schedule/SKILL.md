---
name: schedule
description: Schedule a task to run later or on a recurring basis. Prefer the schedule_task tool; fallback to IPC only if needed.
distribution: public
---

# Schedule a Task

Prefer the built-in `schedule_task` tool.

## Preferred method (tool)

Use `schedule_task` directly with:

- `schedule_type`: `once` | `cron` | `interval`
- `schedule_value`:
  - `once`: ISO timestamp (UTC recommended)
  - `cron`: cron expression
  - `interval`: milliseconds
- `task_kind`: `agent` or `shell`
- `prompt` (agent) or `command` (shell)

Examples:

- One-time agent task at 09:00 UTC:
  - `schedule_type=once`, `schedule_value=2026-03-09T09:00:00Z`
- Daily shell task at 08:30 UTC:
  - `schedule_type=cron`, `schedule_value=30 8 * * *`

## Fallback method (IPC file)

If tool access is unavailable, write an IPC JSON file to `$PICLAW_DATA/ipc/tasks/`:

```bash
cat > "$PICLAW_DATA/ipc/tasks/schedule_$(date +%s).json" <<EOF
{
  "type": "schedule_task",
  "chatJid": "$PICLAW_CHAT_JID",
  "task_kind": "agent",
  "prompt": "Describe what should happen when this task fires",
  "schedule_type": "once",
  "schedule_value": "2026-03-09T09:00:00Z"
}
EOF
```

Shell command variant:

```bash
cat > "$PICLAW_DATA/ipc/tasks/schedule_$(date +%s).json" <<EOF
{
  "type": "schedule_task",
  "chatJid": "$PICLAW_CHAT_JID",
  "task_kind": "shell",
  "command": "ls -la /workspace",
  "cwd": ".",
  "timeout_sec": 30,
  "schedule_type": "interval",
  "schedule_value": "3600000"
}
EOF
```

## Verify it was scheduled

After scheduling, confirm with SQL introspection:

```sql
SELECT id, chat_jid, task_kind, schedule_type, schedule_value, status, next_run
FROM scheduled_tasks
ORDER BY created_at DESC
LIMIT 5;
```

For execution history:

```sql
SELECT task_id, run_at, duration_ms, status
FROM task_run_logs
ORDER BY id DESC
LIMIT 10;
```

## Managing existing tasks (IPC)

- Pause:    `{ "type": "pause_task", "taskId": "task-xxx" }`
- Resume:   `{ "type": "resume_task", "taskId": "task-xxx" }`
- Cancel:   `{ "type": "cancel_task", "taskId": "task-xxx" }`
- Update:   `{ "type": "update_task", "taskId": "task-xxx", "prompt": "...", "model": "...", "schedule_value": "..." }`
- Cleanup:  `{ "type": "cleanup_tasks", "chatJid": "web:default" }`

## Notes

- Shell tasks are pre-validated (no newlines, no destructive patterns, cwd inside `/workspace`).
- Use UTC for human-facing schedules unless asked otherwise.
- Always acknowledge the created schedule and include next run time if available.

## Environment

- `PICLAW_DATA` — piclaw data directory (contains `ipc/`, `sessions/`)
- `PICLAW_CHAT_JID` — JID of the triggering chat
