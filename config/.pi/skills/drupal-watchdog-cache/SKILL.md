---
name: drupal-watchdog-cache
description: Silently updates the JSON cache for the UI Watchdog panel. Responds with a single confirmation line without printing the full logs.
distribution: public
---

# drupal-watchdog-cache

Internal UI skill for DrupalClaw. Writes `/workspace/.piclaw/watchdog.json` with the latest 60 Drupal watchdog entries in compact JSON format. Does not print the logs — responds only with the operation result in a single short line.

## Steps

1. Detect Drush and write JSON cache:
   ```bash
   STACK_STATE="/workspace/.piclaw/stack/state.json"
   if [[ ! -f "$STACK_STATE" ]]; then
     echo "ERROR: No Drupal stack configured for this workspace. Run 'drupal-serve' first."
     exit 1
   fi
   PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE")
   if [[ -z "$PROJECT_NAME" ]]; then
     echo "ERROR: Stack config invalid. Run 'drupal-serve' to reinitialize."
     exit 1
   fi
   PHP_CONTAINER=$(docker ps \
     --filter "status=running" \
     --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
     --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
   else
     echo "ERROR: Stack '${PROJECT_NAME}' is not running. Run 'drupal-serve' to start it."
     exit 1
   fi

   CACHE_DIR="/workspace/.piclaw"
   mkdir -p "$CACHE_DIR"
   # Use 60 entries and compact JSON to stay within PiClaw's 20KB file API limit
   WATCHDOG_JSON=$($DRUSH watchdog:show --count=60 --format=json 2>/dev/null)
   if [[ -n "$WATCHDOG_JSON" && "$WATCHDOG_JSON" != "null" ]]; then
     # Compact JSON (remove whitespace) to minimise file size
     COMPACT=$(echo "$WATCHDOG_JSON" | python3 -c "import sys,json; sys.stdout.write(json.dumps(json.loads(sys.stdin.read())))" 2>/dev/null || echo "$WATCHDOG_JSON")
     printf '%s' "$COMPACT" > "$CACHE_DIR/watchdog.json"
     echo "Cache updated."
   else
     printf '{}' > "$CACHE_DIR/watchdog.json"
     echo "Cache empty (no watchdog entries)."
   fi
   ```
