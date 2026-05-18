---
name: drupal-perf
description: Analisa performance do Drupal — caches, queries lentas, bottlenecks.
distribution: public
---

# drupal-perf

Análise de performance do ambiente Drupal.

## Steps

1. Resolver drush (container vs local):
   ```bash
   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack activa: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
     PHP_CMD="docker exec -w /var/www/html $PHP_CONTAINER php"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     PHP_CMD="php"
   else
     echo "⚠ Stack Docker não está activa — informação parcial."
     DRUSH=""
     PHP_CMD="php"
   fi
   ```

2. Cache status:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo "=== Cache Bins ==="
     $DRUSH cache:status 2>/dev/null || echo "não disponível"
   fi
   ```

3. Tamanho da BD:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Tamanho das tabelas (top 15) ==="
     echo "SELECT table_name, ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = DATABASE() ORDER BY (data_length + index_length) DESC LIMIT 15;" | $DRUSH sql:cli 2>/dev/null || echo "não disponível"
   fi
   ```

4. PHP config relevante:
   ```bash
   echo ""
   echo "=== PHP Performance Config ==="
   $PHP_CMD -r "
     \$keys = ['memory_limit','max_execution_time','opcache.enable','opcache.memory_consumption','opcache.max_accelerated_files','realpath_cache_size'];
     foreach (\$keys as \$k) echo \$k . ' = ' . ini_get(\$k) . PHP_EOL;
   "
   ```

5. Módulos pesados:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Módulos activos (count) ==="
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

6. Sugerir optimizações com base nos dados recolhidos.
