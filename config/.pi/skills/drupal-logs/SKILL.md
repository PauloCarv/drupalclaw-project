---
name: drupal-logs
description: Shows the latest Drupal watchdog logs.
distribution: public
---

# drupal-logs

Shows recent watchdog logs.

## Steps

1. Resolve drush and show watchdog:
   ```bash
   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Active stack: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
   else
     echo "❌ Docker stack not active and local drush not found."
     echo "   To start the stack: use drupal-serve"
     exit 1
   fi

   echo "📋 Latest watchdog logs:"
   $DRUSH watchdog:show --count=25 --format=table 2>/dev/null || echo "Watchdog not available (DB configured?)"
   ```

2. PHP/nginx container error logs:
   ```bash
   echo ""
   echo "=== PHP container logs ==="
   if [[ -n "$PHP_CONTAINER" ]]; then
     docker logs "$PHP_CONTAINER" 2>&1 | tail -20
   else
     PHP_LOG=$(php -r "echo ini_get('error_log');" 2>/dev/null)
     if [[ -n "$PHP_LOG" && -f "$PHP_LOG" ]]; then
       tail -20 "$PHP_LOG"
     else
       echo "No PHP log file configured."
     fi
   fi
   ```
