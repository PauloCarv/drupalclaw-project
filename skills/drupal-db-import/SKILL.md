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

   echo "📥 Importing $DUMP_FILE..."
   if [[ "$DUMP_FILE" == *.gz ]]; then
     gunzip -c "$DUMP_FILE" | $DRUSH sql:cli
   else
     $DRUSH sql:cli < "$DUMP_FILE"
   fi
   $DRUSH cache:rebuild
   echo "✅ Database imported."
   ```

3. Didactic block:
   ```bash
   INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
   echo "INTERACTION_MODE=$INTERACTION_MODE"
   ```

   If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

   💡 **How to replicate manually:**
   ```bash
   gunzip -c backup.sql.gz | vendor/bin/drush sql:cli
   vendor/bin/drush cache:rebuild
   # or via docker:
   gunzip -c backup.sql.gz | docker exec -i <php-container> vendor/bin/drush sql:cli
   ```
   Want to understand what drush sql:cli does or how to migrate between environments? Just ask.
