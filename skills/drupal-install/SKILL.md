---
name: drupal-install
description: Instala um módulo contrib via Composer e activa com Drush.
distribution: public
---

# drupal-install

Instala módulo contrib Drupal.

## Steps

1. O utilizador deve fornecer o nome do módulo (ex: `drupal-install admin_toolbar`).

2. Resolver e instalar via Composer:
   ```bash
   MODULE="${1:-}"
   if [[ -z "$MODULE" ]]; then
     echo "❌ Indica o nome do módulo. Ex: drupal-install admin_toolbar"
     exit 1
   fi

   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack activa: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
     COMPOSER_CMD="docker exec -i -w /var/www/html $PHP_CONTAINER composer"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     COMPOSER_CMD="composer"
   else
     echo "❌ Stack Docker não está activa e drush local não encontrado."
     echo "   Para iniciar a stack: usa drupal-serve"
     exit 1
   fi

   echo "📦 A instalar drupal/$MODULE..."
   $COMPOSER_CMD require "drupal/$MODULE" --no-interaction
   ```

3. Activar com Drush:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo "🔌 A activar $MODULE..."
     $DRUSH en "$MODULE" -y
     $DRUSH cache:rebuild
     echo "✅ Módulo $MODULE instalado e activo."
   else
     echo "⚠ Módulo baixado mas não activado (drush não disponível)."
   fi
   ```
