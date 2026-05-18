---
name: drupal-analyze
description: Executa análise estática (PHPStan + PHPCS) no código custom Drupal.
distribution: public
---

# drupal-analyze

Analisa qualidade do código custom com PHPStan e PHPCS.

## Steps

1. Verificar ferramentas:
   ```bash
   MISSING=""
   command -v vendor/bin/phpstan &>/dev/null || MISSING="$MISSING phpstan"
   command -v vendor/bin/phpcs &>/dev/null || MISSING="$MISSING phpcs"
   if [[ -n "$MISSING" ]]; then
     echo "⚠ Ferramentas em falta:$MISSING"
     echo "A instalar..."
     composer require --dev phpstan/phpstan mglaman/phpstan-drupal phpstan/phpstan-deprecation-rules drupal/coder --no-interaction 2>/dev/null
   fi
   ```

2. Executar PHPStan:
   ```bash
   echo "=== PHPStan ==="
   if [[ -x vendor/bin/phpstan ]]; then
     vendor/bin/phpstan analyse web/modules/custom/ web/themes/custom/ --level=5 --no-progress 2>&1 | tail -30
   else
     echo "phpstan não disponível"
   fi
   ```

3. Executar PHPCS:
   ```bash
   echo ""
   echo "=== PHPCS (Drupal standard) ==="
   if [[ -x vendor/bin/phpcs ]]; then
     vendor/bin/phpcs --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,theme web/modules/custom/ web/themes/custom/ 2>&1 | tail -40
   else
     echo "phpcs não disponível"
   fi
   ```

4. Resumir resultados e sugerir correcções.
