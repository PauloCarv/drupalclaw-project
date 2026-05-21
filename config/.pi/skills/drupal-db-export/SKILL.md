---
name: drupal-db-export
description: Exports the Drupal database to a SQL file.
distribution: public
---

# drupal-db-export

Exports the Drupal DB to a SQL dump.

## Steps

1. Resolve drush and export dump:
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

   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   DUMP_FILE="/workspace/db-export-$TIMESTAMP.sql.gz"

   echo "💾 Exporting database..."
   # sql:dump writes to stdout; gzip locally to avoid path issues between containers
   $DRUSH sql:dump | gzip > "$DUMP_FILE"
   echo "✅ Exported to $DUMP_FILE"
   ls -lh "$DUMP_FILE"
   ```
