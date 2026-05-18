---
name: drupal-db-query
description: Executa uma query SQL na base de dados Drupal.
distribution: public
---

# drupal-db-query

Executa query SQL via Drush.

## Steps

1. O utilizador deve fornecer a query. Ex: `drupal-db-query SELECT COUNT(*) FROM node_field_data`

2. Executar:
   ```bash
   QUERY="${1:-}"
   if [[ -z "$QUERY" ]]; then
     echo "❌ Indica a query SQL."
     echo "Ex: drupal-db-query SELECT COUNT(*) FROM node_field_data"
     exit 1
   fi

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

   echo "🔍 A executar query..."
   echo "$QUERY" | $DRUSH sql:cli
   ```

## Safety

- Queries SELECT são executadas directamente.
- Queries que alteram dados (INSERT/UPDATE/DELETE/DROP/ALTER) devem requerer confirmação do utilizador.
