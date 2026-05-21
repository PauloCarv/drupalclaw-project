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

   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Active stack: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
     PHP_CMD="docker exec -w /var/www/html $PHP_CONTAINER php"
     COMPOSER_CMD="docker exec -w /var/www/html $PHP_CONTAINER composer"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     PHP_CMD="php"
     COMPOSER_CMD="composer"
   else
     echo "⚠ Docker stack not active — partial information."
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
   du -sh . 2>/dev/null
   du -sh vendor/ web/core/ web/modules/contrib/ 2>/dev/null || true
   ```
