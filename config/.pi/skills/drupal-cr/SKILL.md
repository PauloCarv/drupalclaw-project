---
name: drupal-cr
description: Limpa todas as caches do Drupal (cache rebuild).
distribution: public
---

# drupal-cr

Executa cache rebuild via Drush.

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

2. Executar cache rebuild:
   ```bash
   echo "🔄 A limpar caches..."
   $DRUSH cache:rebuild
   echo "✅ Caches limpas."
   ```
