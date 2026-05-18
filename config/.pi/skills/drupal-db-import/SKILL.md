---
name: drupal-db-import
description: Importa um dump SQL para a base de dados Drupal.
distribution: public
---

# drupal-db-import

Importa ficheiro SQL na BD Drupal.

## Steps

1. Localizar dump:
   ```bash
   DUMP_FILE="${1:-}"
   if [[ -z "$DUMP_FILE" ]]; then
     echo "Ficheiros SQL disponíveis:"
     ls -lht /workspace/*.sql /workspace/*.sql.gz 2>/dev/null | head -5
     echo ""
     echo "❌ Indica o ficheiro. Ex: drupal-db-import db-export-20240101.sql.gz"
     exit 1
   fi
   ```

2. Resolver drush e importar:
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

   echo "📥 A importar $DUMP_FILE..."
   if [[ "$DUMP_FILE" == *.gz ]]; then
     gunzip -c "$DUMP_FILE" | $DRUSH sql:cli
   else
     $DRUSH sql:cli < "$DUMP_FILE"
   fi
   $DRUSH cache:rebuild
   echo "✅ Base de dados importada."
   ```
