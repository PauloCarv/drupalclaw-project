---
name: drupal-debug
description: Diagnoses recent Drupal errors — watchdog, PHP errors, config issues.
distribution: public
---

# drupal-debug

Analyses and diagnoses recent issues.

## Steps

1. Resolve drush (container vs local):
   ```bash
   STACK_STATE="/workspace/.piclaw/stack/state.json"
   if [[ ! -f "$STACK_STATE" ]]; then
     echo "❌ No Drupal stack configured for this workspace."
     echo "   Run 'drupal-serve' to initialize the stack."
     exit 1
   fi
   PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE")
   PHP_CONTAINER=$(docker ps \
     --filter "status=running" \
     --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
     --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack: ${PROJECT_NAME} ($PHP_CONTAINER)"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
   else
     echo "❌ Stack '${PROJECT_NAME}' is not running."
     echo "   Run 'drupal-serve' to start it."
     exit 1
   fi
   ```

2. Recent watchdog errors:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo "=== Recent errors (watchdog) ==="
     $DRUSH watchdog:show --severity=error --count=10 --format=table 2>/dev/null || true
     echo ""
     echo "=== Recent warnings ==="
     $DRUSH watchdog:show --severity=warning --count=10 --format=table 2>/dev/null || true
   fi
   ```

3. Check requirements:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Status Report (issues) ==="
     $DRUSH core:requirements --severity=2 --format=table 2>/dev/null || echo "not available"
   fi
   ```

4. PHP/nginx errors (via docker logs):
   ```bash
   echo ""
   echo "=== PHP container logs ==="
   if [[ -n "$PHP_CONTAINER" ]]; then
     docker logs "$PHP_CONTAINER" 2>&1 | grep -iE "error|fatal|warning|notice" | tail -20 || echo "No recent errors"
   else
     PHP_LOG=$(php -r "echo ini_get('error_log');" 2>/dev/null)
     if [[ -n "$PHP_LOG" && -f "$PHP_LOG" ]]; then
       grep -i "error|fatal|warning" "$PHP_LOG" | tail -15
     else
       echo "No PHP log"
     fi
   fi
   ```

5. Config consistency:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Config Sync Status ==="
     $DRUSH config:status --format=table 2>/dev/null | head -20 || echo "not available"
   fi
   ```

6. Suggest fixes based on the errors found.
