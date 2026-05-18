#!/bin/bash
# Restart piclaw: detect the service manager (supervisord or systemd --user)
# and restart piclaw through it. Falls back to manual kill/start when neither
# is available.
#
# Usage: restart-piclaw.sh [--sync|--async] [OLD_PID] [-- CMD...]
#   --sync       Run in the foreground (no self-detach)
#   --async      Force async mode (default)
#   OLD_PID      PID to kill first (fallback only; default: /tmp/piclaw.pid)
#   CMD          command to run (fallback only; default: piclaw --port 8080)
#
# ⚠️ Container admonition:
#   The installed runtime package lives under:
#     /usr/local/lib/bun/install/global/node_modules/piclaw
#   If piclaw resolves from /home/agent/.bun, you're likely restarting the wrong build.
#
# Detection order (first match wins):
#   1. PICLAW_SERVICE_MANAGER=supervisor|systemd|manual  (explicit override)
#   2. supervisorctl available AND a "piclaw" program exists → supervisor
#   3. systemctl --user available AND a "piclaw.service" unit exists → systemd
#   4. Manual kill/start fallback
#
# Logs go to /tmp/restart-piclaw-force.log unless overridden via
# PICLAW_RELOAD_LOG.

set -euo pipefail

export BUN_INSTALL="/usr/local/lib/bun"
export PATH="$BUN_INSTALL/bin:/home/linuxbrew/.linuxbrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

LOG_PATH="${PICLAW_RELOAD_LOG:-/tmp/restart-piclaw-force.log}"
DETACH_DEFAULT="${PICLAW_RELOAD_ASYNC:-1}"
DETACH_MODE="$DETACH_DEFAULT"

# Supervisor settings
SUPERVISOR_SERVICE="${PICLAW_SUPERVISOR_SERVICE:-piclaw}"
SUPERVISORCTL_BIN="${PICLAW_SUPERVISORCTL_BIN:-supervisorctl}"
# Try workspace config first, fall back to /etc
if [ -f "/workspace/.piclaw/supervisor/supervisord.conf" ]; then
  SUPERVISORCTL_CONFIG="${PICLAW_SUPERVISORCTL_CONFIG:-/workspace/.piclaw/supervisor/supervisord.conf}"
else
  SUPERVISORCTL_CONFIG="${PICLAW_SUPERVISORCTL_CONFIG:-/etc/supervisor/supervisord.conf}"
fi

# Systemd settings
SYSTEMD_UNIT="${PICLAW_SYSTEMD_UNIT:-piclaw.service}"

# ── Argument parsing ─────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --sync|--no-async) DETACH_MODE=0; shift ;;
    --async)           DETACH_MODE=1; shift ;;
    *)                 break ;;
  esac
done

if [ -n "${PICLAW_RELOAD_SYNC_MODE:-}" ]; then
  DETACH_MODE=0
fi

# ── Self-detach (async mode) ─────────────────────────────────────────
if [ "$DETACH_MODE" = "1" ]; then
  export PICLAW_RELOAD_SYNC_MODE=1
  mkdir -p "$(dirname "$LOG_PATH")"
  LAUNCH_CMD=()
  command -v setsid >/dev/null 2>&1 && LAUNCH_CMD+=(setsid)
  if command -v nohup >/dev/null 2>&1; then
    nohup "${LAUNCH_CMD[@]}" "$0" "$@" </dev/null >>"$LOG_PATH" 2>&1 &
  else
    "${LAUNCH_CMD[@]}" "$0" "$@" </dev/null >>"$LOG_PATH" 2>&1 &
  fi
  CHILD=$!
  echo "[reload] Restart scheduled asynchronously (PID $CHILD). Follow $LOG_PATH for progress."
  exit 0
fi

# ── Locking ──────────────────────────────────────────────────────────
PIDFILE=/tmp/piclaw.pid
SUPERVISOR_PIDFILE=/tmp/piclaw-supervisor.pid
LOCKFILE=/tmp/piclaw-restart.lock
LOCK_HELD=0

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCKFILE"
  if ! flock -n 9; then
    echo "[reload] Another restart is in progress. Exiting."
    exit 1
  fi
  LOCK_HELD=1
else
  echo "[reload] flock not available; continuing without lock"
fi

# ── Parse positional args (fallback mode only) ───────────────────────
OLD_PID=""
if [ $# -ge 1 ] && [ "$1" != "--" ]; then
  OLD_PID="$1"; shift
fi
[ "${1:-}" = "--" ] && shift

if [ $# -eq 0 ]; then
  set -- piclaw --port "${PICLAW_WEB_PORT:-8080}"
fi

if [ -z "$OLD_PID" ] && [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null || true)
fi

PORT="${PICLAW_WEB_PORT:-8080}"
for ((i=1;i<=$#;i++)); do
  arg="${!i}"
  if [ "$arg" = "--port" ]; then
    next_index=$((i+1)); PORT="${!next_index:-8080}"
  elif [[ "$arg" == --port=* ]]; then
    PORT="${arg#--port=}"
  fi
done

DATA_DIR="${PICLAW_DATA:-/workspace/.piclaw/data}"
IPC_MESSAGES_DIR="$DATA_DIR/ipc/messages"
IPC_TASKS_DIR="$DATA_DIR/ipc/tasks"
NOTIFY_SENT_FILE="/tmp/piclaw-reload-notified"
INTERNAL_SECRET="${PICLAW_INTERNAL_SECRET:-${PICLAW_WEB_INTERNAL_SECRET:-}}"
COMMAND="$1"

echo ""
echo "[reload] === $(date -Iseconds) ==="
echo "[reload] BUN_INSTALL=$BUN_INSTALL"
if command -v piclaw >/dev/null 2>&1; then
  PICLAW_BIN=$(readlink -f "$(command -v piclaw)" 2>/dev/null || command -v piclaw)
  echo "[reload] piclaw binary: $PICLAW_BIN"
  if echo "$PICLAW_BIN" | grep -q "/home/agent/.bun/"; then
    echo "[reload] WARNING: piclaw resolves to /home/agent/.bun; expected /usr/local/lib/bun runtime path."
  fi
else
  echo "[reload] WARNING: piclaw binary not found in PATH"
fi

# ── Service manager detection ────────────────────────────────────────
detect_service_manager() {
  # Explicit override
  if [ -n "${PICLAW_SERVICE_MANAGER:-}" ]; then
    echo "$PICLAW_SERVICE_MANAGER"
    return
  fi

  # 1. Check supervisorctl + piclaw program registered
  #    supervisorctl status exit codes: 0=running, 3=stopped, 4=no such process
  #    Both 0 and 3 mean the program exists; only 4+ means it doesn't.
  if command -v "$SUPERVISORCTL_BIN" >/dev/null 2>&1; then
    local ctl_args=()
    [ -n "$SUPERVISORCTL_CONFIG" ] && [ -f "$SUPERVISORCTL_CONFIG" ] && ctl_args+=(-c "$SUPERVISORCTL_CONFIG")
    local ctl_exit=0
    "$SUPERVISORCTL_BIN" "${ctl_args[@]}" status "$SUPERVISOR_SERVICE" >/dev/null 2>&1 || ctl_exit=$?
    if [ "$ctl_exit" -le 3 ]; then
      echo "supervisor"
      return
    fi
  fi

  # 2. Check systemctl --user + piclaw.service unit exists
  #    Needs XDG_RUNTIME_DIR to talk to the user bus.
  if command -v systemctl >/dev/null 2>&1; then
    local xdg="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    if XDG_RUNTIME_DIR="$xdg" systemctl --user list-unit-files "$SYSTEMD_UNIT" 2>/dev/null \
         | grep -q "$SYSTEMD_UNIT"; then
      echo "systemd"
      return
    fi
  fi

  # 3. Fallback
  echo "manual"
}

SERVICE_MANAGER=$(detect_service_manager)
echo "[reload] Detected service manager: $SERVICE_MANAGER"

# ── Helpers ──────────────────────────────────────────────────────────

wait_for_exit() {
  local pid="$1" label="$2"
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  echo "[reload] ${label} still running after timeout"
  return 1
}

is_zombie() {
  local stat
  stat=$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ')
  [[ "$stat" == *Z* ]]
}

find_port_pid() {
  command -v ss >/dev/null 2>&1 || return 0
  ss -ltnp "sport = :$PORT" 2>/dev/null \
    | awk -F 'pid=' 'NR>1 {split($2,a,","); print a[1]}' | head -1
}

wait_for_agent_idle() {
  command -v curl >/dev/null 2>&1 || { echo "[reload] curl not available; skipping agent status wait."; return 0; }
  local url="http://127.0.0.1:$PORT/agent/status"
  local attempt=0 max_attempts=120
  local -a headers=()
  [ -n "$INTERNAL_SECRET" ] && headers+=(-H "X-Piclaw-Internal-Secret: $INTERNAL_SECRET")
  while true; do
    local resp
    resp=$(curl -fsS --max-time 2 "${headers[@]}" "$url" 2>/dev/null || true)
    if [ -z "$resp" ]; then
      [ $attempt -eq 0 ] && echo "[reload] Agent status unavailable; proceeding."
      return 0
    fi
    if echo "$resp" | grep -q '"status":"active"'; then
      [ $attempt -eq 0 ] && echo "[reload] Waiting for active agent turn to finish..."
      attempt=$((attempt + 1))
      [ $attempt -ge $max_attempts ] && { echo "[reload] Waited ${max_attempts}s; continuing."; return 0; }
      sleep 1; continue
    fi
    [ $attempt -gt 0 ] && echo "[reload] Active turn finished; continuing reload."
    return 0
  done
}

kill_pid() {
  local pid="$1" label="$2"
  [ -z "$pid" ] && return 0
  kill -0 "$pid" 2>/dev/null || return 0
  is_zombie "$pid" && { echo "[reload] ${label} ($pid) is a zombie; skipping"; return 0; }
  echo "[reload] Stopping ${label} ($pid)..."
  kill "$pid" 2>/dev/null || true
  wait_for_exit "$pid" "$label" || true
  if kill -0 "$pid" 2>/dev/null; then
    echo "[reload] Force-killing ${label} ($pid)"
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
  fi
}

tidy_lock() {
  if [ "$LOCK_HELD" -eq 1 ]; then
    flock -u 9 || true
    exec 9>&- || true
  fi
}

CHILD_PID=""
handle_signal() {
  echo "[reload] Signal received, shutting down..."
  [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null && {
    kill "$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  }
  tidy_lock; exit 0
}
trap handle_signal SIGTERM SIGINT

notify_ready() {
  local ready_port="${1:-$PORT}"
  [ -f "$NOTIFY_SENT_FILE" ] && return 0
  for _ in $(seq 1 40); do
    if bash -c "</dev/tcp/127.0.0.1/$ready_port" >/dev/null 2>&1; then
      mkdir -p "$IPC_MESSAGES_DIR"
      cat > "$IPC_MESSAGES_DIR/reload_$(date +%s%N).json" <<EOF
{"type":"message","chatJid":"web:default","text":"Piclaw reload complete."}
EOF
      echo "ready" > "$NOTIFY_SENT_FILE"
      return 0
    fi
    sleep 0.5
  done
  echo "[reload] Ready check timed out; skipping reload notification."
}

queue_resume_pending() {
  mkdir -p "$IPC_TASKS_DIR" 2>/dev/null || {
    echo "[reload] Unable to create IPC tasks dir; skipping resume queue."; return 0
  }
  ls "$IPC_TASKS_DIR"/resume_pending_*.json >/dev/null 2>&1 && {
    echo "[reload] Resume IPC already queued; skipping."; return 0
  }
  cat > "$IPC_TASKS_DIR/resume_pending_$(date +%s%N).json" <<EOF
{"type":"resume_pending","chatJid":"all","reason":"reload"}
EOF
  echo "[reload] Queued resume_pending IPC."
}

# ── Restart via supervisor ───────────────────────────────────────────
restart_supervisor() {
  local ctl_args=()
  [ -n "$SUPERVISORCTL_CONFIG" ] && [ -f "$SUPERVISORCTL_CONFIG" ] && ctl_args+=(-c "$SUPERVISORCTL_CONFIG")
  echo "[reload] Restarting $SUPERVISOR_SERVICE via $SUPERVISORCTL_BIN"
  if "$SUPERVISORCTL_BIN" "${ctl_args[@]}" restart "$SUPERVISOR_SERVICE" 2>&1; then
    echo "[reload] Supervisor restart succeeded"
    return 0
  fi
  echo "[reload] Supervisor restart failed"
  return 1
}

# ── Restart via systemd --user ───────────────────────────────────────
restart_systemd() {
  echo "[reload] Restarting $SYSTEMD_UNIT via systemctl --user"
  if systemctl --user restart "$SYSTEMD_UNIT" 2>&1; then
    echo "[reload] systemd --user restart succeeded"
    return 0
  fi
  echo "[reload] systemd --user restart failed"
  return 1
}

# ── Manual fallback ──────────────────────────────────────────────────
restart_manual() {
  echo "[reload] Manual restart (no service manager)"

  if ! command -v "$COMMAND" >/dev/null 2>&1; then
    echo "[reload] Command not found: $COMMAND"
    return 1
  fi

  kill_pid "$OLD_PID" "old piclaw"

  PORT_PID=$(find_port_pid)
  if [ -n "$PORT_PID" ]; then
    CMDLINE=$(ps -p "$PORT_PID" -o cmd= 2>/dev/null || true)
    if echo "$CMDLINE" | grep -qi "piclaw"; then
      kill_pid "$PORT_PID" "piclaw on port $PORT"
    else
      echo "[reload] Port $PORT in use by PID $PORT_PID ($CMDLINE). Aborting."
      return 1
    fi
  fi

  # Kill old script-supervisor if present
  if [ -f "$SUPERVISOR_PIDFILE" ]; then
    OLD_SUPERVISOR=$(cat "$SUPERVISOR_PIDFILE" 2>/dev/null || true)
    [ -n "$OLD_SUPERVISOR" ] && [ "$OLD_SUPERVISOR" != "$$" ] && kill_pid "$OLD_SUPERVISOR" "old supervisor"
  fi
  echo $$ > "$SUPERVISOR_PIDFILE"
  tidy_lock

  echo "[reload] Starting: $* (supervisor PID $$)"
  local attempt=0
  while true; do
    attempt=$((attempt + 1))
    "$@" &
    CHILD_PID=$!
    echo "$CHILD_PID" > "$PIDFILE"
    [ ! -f "$NOTIFY_SENT_FILE" ] && notify_ready &
    wait "$CHILD_PID"
    local status=$?
    CHILD_PID=""
    [ $status -eq 0 ] && { echo "[reload] piclaw exited cleanly"; exit 0; }
    [ $attempt -ge 5 ] && { echo "[reload] piclaw exited with status $status; giving up"; exit $status; }
    echo "[reload] piclaw exited with status $status; restarting in 2s"
    sleep 2
  done
}

# ── Main ─────────────────────────────────────────────────────────────

wait_for_agent_idle
queue_resume_pending
rm -f "$NOTIFY_SENT_FILE"

case "$SERVICE_MANAGER" in
  supervisor)
    if restart_supervisor; then
      notify_ready &
      rm -f "$PIDFILE" "$SUPERVISOR_PIDFILE"
      tidy_lock; exit 0
    fi
    echo "[reload] Supervisor restart failed; aborting to avoid conflicts."
    tidy_lock; exit 1
    ;;
  systemd)
    if restart_systemd; then
      notify_ready &
      rm -f "$PIDFILE" "$SUPERVISOR_PIDFILE"
      tidy_lock; exit 0
    fi
    echo "[reload] systemd --user restart failed; aborting."
    tidy_lock; exit 1
    ;;
  manual)
    restart_manual "$@"
    ;;
  *)
    echo "[reload] Unknown service manager: $SERVICE_MANAGER"
    tidy_lock; exit 1
    ;;
esac
