---
name: drupal-status
description: Mostra estado do projecto Drupal — versão, módulos, BD, estado geral.
distribution: public
---

# drupal-status

Mostra estado completo do projecto Drupal.

## Steps

1. Verificar projecto e resolver drush:
   ```bash
   if [[ ! -f composer.json ]] || ! grep -q "drupal/core" composer.json; then
     echo "❌ Não encontrei projecto Drupal."
     exit 1
   fi

   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack activa: $PHP_CONTAINER"
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
     PHP_CMD="docker exec -w /var/www/html $PHP_CONTAINER php"
     COMPOSER_CMD="docker exec -w /var/www/html $PHP_CONTAINER composer"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
     PHP_CMD="php"
     COMPOSER_CMD="composer"
   else
     echo "⚠ Stack Docker não está activa — informação parcial."
     DRUSH=""
     PHP_CMD="php"
     COMPOSER_CMD="composer"
   fi
   ```

2. Versão do Drupal:
   ```bash
   echo "=== Versão Drupal ==="
   $COMPOSER_CMD show drupal/core 2>/dev/null | grep -E "^(name|versions)" || echo "não instalado"
   ```

3. Drush status:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Drush Status ==="
     $DRUSH status --fields=drupal-version,db-driver,db-hostname,db-name,bootstrap,theme,admin-theme 2>/dev/null || echo "BD não configurada"
   fi
   ```

4. Módulos instalados:
   ```bash
   if [[ -n "$DRUSH" ]]; then
     echo ""
     echo "=== Módulos Activos ==="
     $DRUSH pm:list --status=enabled --format=table 2>/dev/null | head -30 || echo "não disponível"
   fi
   ```

5. PHP info:
   ```bash
   echo ""
   echo "=== PHP ==="
   $PHP_CMD -v | head -1
   echo "Extensions: $($PHP_CMD -m | wc -l) carregadas"
   ```

6. Espaço em disco:
   ```bash
   echo ""
   echo "=== Disco ==="
   du -sh . 2>/dev/null
   du -sh vendor/ web/core/ web/modules/contrib/ 2>/dev/null || true
   ```
