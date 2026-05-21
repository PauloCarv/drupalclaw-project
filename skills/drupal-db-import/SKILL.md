---
name: drupal-db-import
description: Imports a SQL dump into the Drupal database.
distribution: public
---

# drupal-db-import

Imports a SQL file into the Drupal DB.

## Steps

1. Locate dump:
   ```bash
   DUMP_FILE="${1:-}"
   if [[ -z "$DUMP_FILE" ]]; then
     echo "Available SQL files:"
     ls -lht /workspace/*.sql /workspace/*.sql.gz 2>/dev/null | head -5
     echo ""
     echo "❌ Provide the file. Ex: drupal-db-import db-export-20240101.sql.gz"
     exit 1
   fi
   ```

2. Resolve drush and import:
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

   echo "📥 Importing $DUMP_FILE..."
   if [[ "$DUMP_FILE" == *.gz ]]; then
     gunzip -c "$DUMP_FILE" | $DRUSH sql:cli
   else
     $DRUSH sql:cli < "$DUMP_FILE"
   fi
   $DRUSH cache:rebuild
   echo "✅ Database imported."
   ```
