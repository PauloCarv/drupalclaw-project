---
name: drupal-analyze
description: Runs static analysis (PHPStan + PHPCS) on custom Drupal code.
distribution: public
---

# drupal-analyze

Analyses custom code quality with PHPStan and PHPCS.

## Steps

1. Check tools:
   ```bash
   MISSING=""
   command -v vendor/bin/phpstan &>/dev/null || MISSING="$MISSING phpstan"
   command -v vendor/bin/phpcs &>/dev/null || MISSING="$MISSING phpcs"
   if [[ -n "$MISSING" ]]; then
     echo "⚠ Missing tools:$MISSING"
     echo "Installing..."
     composer require --dev phpstan/phpstan mglaman/phpstan-drupal phpstan/phpstan-deprecation-rules drupal/coder --no-interaction 2>/dev/null
   fi
   ```

2. Run PHPStan:
   ```bash
   echo "=== PHPStan ==="
   if [[ -x vendor/bin/phpstan ]]; then
     vendor/bin/phpstan analyse web/modules/custom/ web/themes/custom/ --level=5 --no-progress 2>&1 | tail -15
   else
     echo "phpstan not available"
   fi
   ```

3. Run PHPCS:
   ```bash
   echo ""
   echo "=== PHPCS (Drupal standard) ==="
   if [[ -x vendor/bin/phpcs ]]; then
     vendor/bin/phpcs --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,theme web/modules/custom/ web/themes/custom/ 2>&1 | tail -20
   else
     echo "phpcs not available"
   fi
   ```

4. Summarise results and suggest fixes.

5. Didactic block:
   ```bash
   INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
   echo "INTERACTION_MODE=$INTERACTION_MODE"
   ```

   If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

   💡 **How to replicate manually:**
   ```bash
   vendor/bin/phpstan analyse web/modules/custom/ --level=5
   vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom/
   ```
   Want to understand the error levels or configure custom rules? Just ask.
