---
name: drupal-logs
description: Mostra os últimos logs do watchdog Drupal.
distribution: public
---

# drupal-logs

Mostra logs recentes do watchdog.

## Steps

1. Resolver drush e mostrar watchdog:
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

   echo "📋 Últimos logs do watchdog:"
   $DRUSH watchdog:show --count=25 --format=table 2>/dev/null || echo "Watchdog não disponível (BD configurada?)"
   ```

2. Logs de erro do container PHP/nginx:
   ```bash
   echo ""
   echo "=== Logs container PHP ==="
   if [[ -n "$PHP_CONTAINER" ]]; then
     docker logs "$PHP_CONTAINER" 2>&1 | tail -20
   else
     PHP_LOG=$(php -r "echo ini_get('error_log');" 2>/dev/null)
     if [[ -n "$PHP_LOG" && -f "$PHP_LOG" ]]; then
       tail -20 "$PHP_LOG"
     else
       echo "Sem ficheiro de log PHP configurado."
     fi
   fi
   ```
