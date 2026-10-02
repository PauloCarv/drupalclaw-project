---
name: drupal-serve
description: Starts the Drupal stack (nginx + PHP-FPM + DB) via Docker containers. Replaces the built-in php -S.
distribution: public
---

# drupal-serve

Starts the Drupal development stack using Docker containers (nginx + PHP-FPM + DB).

## Parameters

- `db` — mariadb | postgres | sqlite (default: asks the user if not configured)
- `port` — port to access Drupal (default: auto-detect from 8085)

## Steps

### 1. Check if a Drupal project exists (soft warning)

```bash
WORKSPACE_DIR="/workspace"
DRUPAL_DIR="${WORKSPACE_DIR}/drupal"
if [[ ! -d "$DRUPAL_DIR" ]]; then
  DRUPAL_DIR="$WORKSPACE_DIR"
fi

DRUPAL_EXISTS=false
if [[ -f "${DRUPAL_DIR}/composer.json" ]] && grep -q "drupal/core" "${DRUPAL_DIR}/composer.json"; then
  DRUPAL_EXISTS=true
  echo "✅ Drupal project found: $DRUPAL_DIR"
else
  echo "ℹ️  No Drupal project found — the stack will start anyway."
  echo "   Once the stack is running, use 'drupal-init' to create the Drupal project."
  echo ""
fi
```

### 2. Check Docker socket

```bash
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker socket not available."
  echo ""
  echo "The PiClaw container must be started with:"
  echo "  -v /var/run/docker.sock:/var/run/docker.sock"
  echo ""
  echo "Quick alternative (php built-in server, no DB):"
  echo "  cd ${DRUPAL_DIR}/web && php -S 0.0.0.0:8888 .ht.router.php"
  exit 1
fi
```

### 3. Check if stack is already running

```bash
STATE_FILE="${WORKSPACE_DIR}/.piclaw/stack/state.json"
if [[ -f "$STATE_FILE" ]]; then
  EXISTING_URL=$(jq -r '.drupal_url // empty' "$STATE_FILE" 2>/dev/null)
  EXISTING_PROJECT=$(jq -r '.project_name // empty' "$STATE_FILE" 2>/dev/null)
  if [[ -n "$EXISTING_URL" && -n "$EXISTING_PROJECT" ]] && docker ps --filter "status=running" --filter "label=com.docker.compose.project=${EXISTING_PROJECT}" --format '{{.Names}}' 2>/dev/null | grep -qiE "php|fpm"; then
    echo "✅ Stack is already running!"
    echo "  🌐 $EXISTING_URL"
    echo ""
    echo "To restart: drupal-stack restart"
    echo "To stop: drupal-stack stop"
    exit 0
  fi
fi
```

### 4. Ask user for DB type (if not specified)

If the `db` parameter was not provided, ask the user which database to use and wait for their reply before continuing. Format your question exactly like this:

Which database do you want to use?

- **MariaDB** — recommended, MySQL-compatible
- **PostgreSQL** — native Drupal support
- **SQLite** — no extra container, local file

Reply with the name of your choice.

### 5. Start stack via drupal-stack

```bash
# DB_TYPE comes from the parameter or user choice
DB_TYPE="${DB_TYPE:-mariadb}"
export DB_TYPE

echo "🚀 Starting Drupal stack with $DB_TYPE..."
```

Run the `drupal-stack` skill with `action=start` and `db=$DB_TYPE`.

### 6. Show result

```bash
STATE_FILE="${WORKSPACE_DIR}/.piclaw/stack/state.json"
if [[ -f "$STATE_FILE" ]]; then
  URL=$(jq -r '.drupal_url' "$STATE_FILE")
  DB=$(jq -r '.db_type' "$STATE_FILE")
  echo ""
  echo "═══════════════════════════════════════════════"
  if [[ "$DRUPAL_EXISTS" == "true" ]]; then
    echo "✅ Drupal stack running!"
    echo "  🌐 Site: $URL"
  else
    echo "✅ Stack running! Next step: create the Drupal project."
    echo "  🗄️  Database available at: $URL"
  fi
  echo "  🗄️  DB: $DB"
  echo "═══════════════════════════════════════════════"
  echo ""
  if [[ "$DRUPAL_EXISTS" == "false" ]]; then
    echo "👉 Next step: use 'drupal-init' to create the Drupal project."
    echo "   The database is ready and will be used automatically."
    echo ""
  fi
  echo "Useful commands:"
  echo "  drupal-stack stop     — stop stack"
  echo "  drupal-stack restart  — restart"
  echo "  drupal-stack status   — view status"
  echo "  drupal-stack destroy  — remove everything (incl. DB data)"
fi
```

### 7. Didactic block

```bash
INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
echo "INTERACTION_MODE=$INTERACTION_MODE"
```

If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

💡 **How to replicate manually:**
```bash
docker compose -f docker-compose.drupal.yml -p <project> up -d --build
docker compose -f docker-compose.drupal.yml -p <project> ps
```
Want a step-by-step explanation of how the stack is configured? Just ask.
