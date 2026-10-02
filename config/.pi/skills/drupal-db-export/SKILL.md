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

   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   DUMP_FILE="/workspace/db-export-$TIMESTAMP.sql.gz"

   echo "💾 Exporting database..."
   # sql:dump writes to stdout; gzip locally to avoid path issues between containers
   $DRUSH sql:dump | gzip > "$DUMP_FILE"
   echo "✅ Exported to $DUMP_FILE"
   ls -lh "$DUMP_FILE"
   ```

3. Didactic block:
   ```bash
   INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
   echo "INTERACTION_MODE=$INTERACTION_MODE"
   ```

   If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

   💡 **How to replicate manually:**
   ```bash
   vendor/bin/drush sql:dump | gzip > backup.sql.gz
   # or via docker:
   docker exec -i <php-container> vendor/bin/drush sql:dump | gzip > backup.sql.gz
   ```
   Want to learn about backup strategies or automating exports? Just ask.
