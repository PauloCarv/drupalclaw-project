---
name: drupal-install
description: Installs a contrib module via Composer and enables it with Drush.
distribution: public
---

# drupal-install

Installs a Drupal contrib module.

## Steps

1. The user must provide the module name (e.g. `drupal-install admin_toolbar`).

2. Resolve and install via Composer:
   ```bash
   MODULE="${1:-}"
   if [[ -z "$MODULE" ]]; then
     echo "❌ Provide the module name. Ex: drupal-install admin_toolbar"
     exit 1
   fi

   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Active stack: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
     COMPOSER_CMD="docker exec -i -w /var/www/html $PHP_CONTAINER composer"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     COMPOSER_CMD="composer"
   else
     echo "❌ Docker stack not active and local drush not found."
     echo "   To start the stack: use drupal-serve"
     exit 1
   fi

   echo "📦 Installing drupal/$MODULE..."
   $COMPOSER_CMD require "drupal/$MODULE" --no-interaction
   ```

3. Enable with Drush:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo "🔌 Enabling $MODULE..."
     $DRUSH en "$MODULE" -y
     $DRUSH cache:rebuild
     echo "✅ Module $MODULE installed and enabled."
   else
     echo "⚠ Module downloaded but not enabled (drush not available)."
   fi
   ```
