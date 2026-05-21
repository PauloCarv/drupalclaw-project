---
name: drupal-cr
description: Clears all Drupal caches (cache rebuild).
distribution: public
---

# drupal-cr

Runs cache rebuild via Drush.

## Steps

1. Resolve drush (container vs local):
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
   ```

2. Run cache rebuild:
   ```bash
   echo "🔄 Clearing caches..."
   $DRUSH cache:rebuild
   echo "✅ Caches cleared."
   ```
