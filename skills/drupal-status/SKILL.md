---
name: drupal-status
description: Shows Drupal project status — version, modules, DB, general state.
distribution: public
---

# drupal-status

Shows the full Drupal project status.

## Steps

1. Check project and resolve drush:
   ```bash
   if [[ ! -f composer.json ]] || ! grep -q "drupal/core" composer.json; then
     echo "❌ No Drupal project found."
     exit 1
   fi

   STACK_STATE="/workspace/.piclaw/stack/state.json"
   PROJECT_NAME=""
   if [[ -f "$STACK_STATE" ]]; then
     PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE")
   fi
   PHP_CONTAINER=""
   if [[ -n "$PROJECT_NAME" ]]; then
     PHP_CONTAINER=$(docker ps \
       --filter "status=running" \
       --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
       --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
   fi
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack: ${PROJECT_NAME} ($PHP_CONTAINER)"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
     PHP_CMD="docker exec -w /var/www/html $PHP_CONTAINER php"
     COMPOSER_CMD="docker exec -w /var/www/html $PHP_CONTAINER composer"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     PHP_CMD="php"
     COMPOSER_CMD="composer"
   else
     echo "⚠ Stack not active — partial information. Run 'drupal-serve' to start it."
     DRUSH=""
     PHP_CMD="php"
     COMPOSER_CMD="composer"
   fi
   ```

2. Drupal version:
   ```bash
   echo "=== Drupal version ==="
   $COMPOSER_CMD show drupal/core 2>/dev/null | grep -E "^(name|versions)" || echo "not installed"
   ```

3. Drush status:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Drush Status ==="
     $DRUSH status --fields=drupal-version,db-driver,db-hostname,db-name,bootstrap,theme,admin-theme 2>/dev/null || echo "DB not configured"
   fi
   ```

4. Installed modules:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Active modules ==="
     $DRUSH pm:list --status=enabled --format=table 2>/dev/null | head -30 || echo "not available"
   fi
   ```

5. PHP info:
   ```bash
   echo ""
   echo "=== PHP ==="
   $PHP_CMD -v | head -1
   echo "Extensions: $($PHP_CMD -m | wc -l) loaded"
   ```

6. Disk space:
   ```bash
   echo ""
   echo "=== Disk ==="
   df -h . 2>/dev/null | tail -1
   timeout 10 du -sh vendor/ web/core/ web/modules/contrib/ 2>/dev/null || true
   ```
