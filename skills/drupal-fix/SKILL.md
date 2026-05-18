---
name: drupal-fix
description: Corrige automaticamente erros de código detectados pelo PHPCS/PHPStan.
distribution: public
---

# drupal-fix

Corrige automaticamente problemas de código.

## Steps

1. Executar PHPCBF (auto-fix):
   ```bash
   echo "=== PHPCBF Auto-fix ==="
   if [[ -x vendor/bin/phpcbf ]]; then
     vendor/bin/phpcbf --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,theme web/modules/custom/ web/themes/custom/ 2>&1 || true
   else
     echo "phpcbf não encontrado. Instalar: composer require --dev drupal/coder"
   fi
   ```

2. Re-executar análise para confirmar:
   ```bash
   echo ""
   echo "=== Verificação pós-fix ==="
   if [[ -x vendor/bin/phpcs ]]; then
     ERRORS=$(vendor/bin/phpcs --standard=Drupal --extensions=php,module web/modules/custom/ 2>&1 | grep -c "ERROR" || true)
     echo "Erros restantes: $ERRORS"
   fi
   ```

3. Reportar ficheiros alterados:
   ```bash
   echo ""
   echo "=== Ficheiros modificados ==="
   git diff --name-only 2>/dev/null || echo "(sem git)"
   ```
