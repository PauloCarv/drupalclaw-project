---
name: drupal-debug
description: Diagnostica erros recentes no Drupal — watchdog, PHP errors, config issues.
distribution: public
---

# drupal-debug

Analisa e diagnostica problemas recentes.

## Steps

1. Resolver drush (container vs local):
   ```bash
   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack activa: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
   else
     echo "❌ Stack Docker não está activa e drush local não encontrado."
     echo "   Para iniciar a stack: usa drupal-serve"
     exit 1
   fi
   ```

2. Erros recentes no watchdog:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo "=== Erros recentes (watchdog) ==="
     $DRUSH watchdog:show --severity=error --count=10 --format=table 2>/dev/null || true
     echo ""
     echo "=== Warnings recentes ==="
     $DRUSH watchdog:show --severity=warning --count=10 --format=table 2>/dev/null || true
   fi
   ```

3. Verificar requirements:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Status Report (problemas) ==="
     $DRUSH core:requirements --severity=2 --format=table 2>/dev/null || echo "não disponível"
   fi
   ```

4. PHP/nginx errors (via docker logs):
   ```bash
   echo ""
   echo "=== Logs do container PHP ==="
   if [[ -n "$PHP_CONTAINER" ]]; then
     docker logs "$PHP_CONTAINER" 2>&1 | grep -iE "error|fatal|warning|notice" | tail -20 || echo "Sem erros recentes"
   else
     PHP_LOG=$(php -r "echo ini_get('error_log');" 2>/dev/null)
     if [[ -n "$PHP_LOG" && -f "$PHP_LOG" ]]; then
       grep -i "error|fatal|warning" "$PHP_LOG" | tail -15
     else
       echo "Sem log PHP"
     fi
   fi
   ```

5. Config consistency:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Config Sync Status ==="
     $DRUSH config:status --format=table 2>/dev/null | head -20 || echo "não disponível"
   fi
   ```

6. Sugerir correcções com base nos erros encontrados.
