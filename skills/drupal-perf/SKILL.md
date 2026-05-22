---
name: drupal-perf
description: Analyses Drupal performance — caches, slow queries, bottlenecks.
distribution: public
---

# drupal-perf

Performance analysis of the Drupal environment.

## Steps

1. Resolve drush (container vs local):
   ```bash
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
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     PHP_CMD="php"
   else
     echo "⚠ Stack not active — partial information. Run 'drupal-serve' to start it."
     DRUSH=""
     PHP_CMD="php"
   fi
   ```

2. Cache status:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo "=== Cache Bins ==="
     $DRUSH cache:status 2>/dev/null || echo "not available"
   fi
   ```

3. DB size:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Table sizes (top 15) ==="
     echo "SELECT table_name, ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = DATABASE() ORDER BY (data_length + index_length) DESC LIMIT 15;" | $DRUSH sql:cli 2>/dev/null || echo "not available"
   fi
   ```

4. PHP performance config:
   ```bash
   echo ""
   echo "=== PHP Performance Config ==="
   $PHP_CMD -r "
     \$keys = ['memory_limit','max_execution_time','opcache.enable','opcache.memory_consumption','opcache.max_accelerated_files','realpath_cache_size'];
     foreach (\$keys as \$k) echo \$k . ' = ' . ini_get(\$k) . PHP_EOL;
   "
   ```

5. Heavy modules:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Active modules (count) ==="
     $DRUSH pm:list --status=enabled --format=list 2>/dev/null | wc -l
   fi
   ```

5. Disk I/O check:
   ```bash
   echo ""
   echo "=== Disk Performance (simple write test) ==="
   TMPF=$(mktemp)
   START=$(date +%s%N)
   dd if=/dev/zero of="$TMPF" bs=1M count=10 2>/dev/null
   END=$(date +%s%N)
   rm -f "$TMPF"
   echo "10MB write: $(( (END - START) / 1000000 ))ms"
   ```

6. Suggest optimisations based on collected data.
