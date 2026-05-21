---
name: drupal-fix
description: Automatically fixes code errors detected by PHPCS/PHPStan.
distribution: public
---

# drupal-fix

Automatically fixes code issues.

## Steps

1. Run PHPCBF (auto-fix):
   ```bash
   echo "=== PHPCBF Auto-fix ==="
   if [[ -x vendor/bin/phpcbf ]]; then
     vendor/bin/phpcbf --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,theme web/modules/custom/ web/themes/custom/ 2>&1 || true
   else
     echo "phpcbf not found. Install with: composer require --dev drupal/coder"
   fi
   ```

2. Re-run analysis to confirm:
   ```bash
   echo ""
   echo "=== Post-fix verification ==="
   if [[ -x vendor/bin/phpcs ]]; then
     ERRORS=$(vendor/bin/phpcs --standard=Drupal --extensions=php,module web/modules/custom/ 2>&1 | grep -c "ERROR" || true)
     echo "Remaining errors: $ERRORS"
   fi
   ```

3. Report changed files:
   ```bash
   echo ""
   echo "=== Modified files ==="
   git diff --name-only 2>/dev/null || echo "(no git)"
   ```
