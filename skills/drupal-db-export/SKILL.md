---
name: drupal-db-export
description: Exporta a base de dados Drupal para ficheiro SQL.
distribution: public
---

# drupal-db-export

Exporta a BD Drupal para um dump SQL.

## Steps

1. Resolver drush e exportar dump:
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

   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   DUMP_FILE="/workspace/db-export-$TIMESTAMP.sql.gz"

   echo "💾 A exportar base de dados..."
   # sql:dump escreve para stdout; gzip localmente para evitar problemas de paths entre containers
   $DRUSH sql:dump | gzip > "$DUMP_FILE"
   echo "✅ Exportado para $DUMP_FILE"
   ls -lh "$DUMP_FILE"
   ```
