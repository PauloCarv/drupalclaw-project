---
name: drupal-db-query
description: Runs a SQL query on the Drupal database.
distribution: public
---

# drupal-db-query

Runs a SQL query via Drush.

## Steps

1. The user must provide the query. Ex: `drupal-db-query SELECT COUNT(*) FROM node_field_data`

2. Run:
   ```bash
   QUERY="${1:-}"
   if [[ -z "$QUERY" ]]; then
     echo "❌ Provide the SQL query."
     echo "Ex: drupal-db-query SELECT COUNT(*) FROM node_field_data"
     exit 1
   fi

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

   echo "🔍 Running query..."
   echo "$QUERY" | $DRUSH sql:cli
   ```

## Safety

- SELECT queries run directly.
- Data-modifying queries (INSERT/UPDATE/DELETE/DROP/ALTER) must require user confirmation.
