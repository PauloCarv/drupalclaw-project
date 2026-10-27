---
name: drupal-theme
description: Creates a custom Drupal theme from the core Starterkit and enables it.
distribution: public
---

# drupal-theme

Generates a new custom theme in `web/themes/custom/<name>` from the core Starterkit theme, then enables it.
Setting it as the default theme only happens when the user asks for it.

## Steps

1. Ask for the theme name (if not provided):
   - If the user included a name in the message, use it.
   - Otherwise, suggest a machine name and a human-readable label, and ask.
   - Ask whether it should become the default front-end theme. Default: no.

2. Resolve the PHP container (container vs local):
   ```bash
   STACK_STATE="/workspace/.piclaw/stack/state.json"
   if [[ ! -f "$STACK_STATE" ]]; then
     echo "❌ No Drupal stack configured for this workspace."
     echo "   Run 'drupal-serve' to initialize the stack."
     exit 1
   fi
   PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE")
   PHP_CONTAINER=$(docker ps \
     --filter "status=running" \
     --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
     --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack: ${PROJECT_NAME} ($PHP_CONTAINER)"
     RUN="docker exec -i -w /var/www/html $PHP_CONTAINER"
   elif [[ -x "/workspace/drupal/vendor/bin/drush" ]]; then
     cd /workspace/drupal
     RUN=""
   else
     echo "❌ Stack '${PROJECT_NAME}' is not running."
     echo "   Run 'drupal-serve' to start it."
     exit 1
   fi
   DRUSH="$RUN vendor/bin/drush"
   ```

3. Validate the name:
   ```bash
   THEME_NAME="${1:-my_theme}"
   THEME_NAME=$(echo "$THEME_NAME" | tr '-' '_' | tr '[:upper:]' '[:lower:]')
   THEME_LABEL="${2:-$THEME_NAME}"
   if [[ ! "$THEME_NAME" =~ ^[a-z][a-z0-9_]*$ ]]; then
     echo "❌ Invalid machine name '$THEME_NAME' (lowercase letters, digits and underscores, starting with a letter)."
     exit 1
   fi
   THEME_DIR="/workspace/drupal/web/themes/custom/$THEME_NAME"
   if [[ -d "$THEME_DIR" ]]; then
     echo "⚠ Theme $THEME_NAME already exists at $THEME_DIR"
     ls -la "$THEME_DIR"
     exit 0
   fi
   ```

4. Generate the theme from the Starterkit. `--path` is relative to the Drupal root (`web/`).
   Drupal 11.4+ ships `vendor/bin/dr`; older versions use `core/scripts/drupal`:
   ```bash
   if $RUN test -x vendor/bin/dr; then
     GEN="$RUN vendor/bin/dr generate-theme"
   else
     GEN="$RUN php web/core/scripts/drupal generate-theme"
   fi
   $GEN "$THEME_NAME" --name "$THEME_LABEL" --path themes/custom
   ```

5. Enable the theme and rebuild caches:
   ```bash
   $DRUSH theme:enable "$THEME_NAME"
   $DRUSH cache:rebuild
   ```

6. Only if the user asked for it, make it the default front-end theme:
   ```bash
   $DRUSH config:set system.theme default "$THEME_NAME" -y
   $DRUSH cache:rebuild
   ```

7. Report:
   ```bash
   echo "✅ Theme created at web/themes/custom/$THEME_NAME"
   find "$THEME_DIR" -maxdepth 1 -mindepth 1 | sed "s|$THEME_DIR/||" | sort
   DRUPAL_URL=$(jq -r '.drupal_url // empty' "$STACK_STATE")
   [[ -n "$DRUPAL_URL" ]] && echo "Appearance: $DRUPAL_URL/admin/appearance"
   ```

8. Didactic block:
   ```bash
   INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
   echo "INTERACTION_MODE=$INTERACTION_MODE"
   ```

   If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

   💡 **How to replicate manually:**
   ```bash
   php web/core/scripts/drupal generate-theme <name> --name "<Label>" --path themes/custom
   # Drupal 11.4+: vendor/bin/dr generate-theme <name> --name "<Label>" --path themes/custom
   vendor/bin/drush theme:enable <name>
   vendor/bin/drush config:set system.theme default <name> -y   # optional
   vendor/bin/drush cr
   ```
   The Starterkit copies a full theme you own, not a sub-theme, so core updates never change it.
   Want to add a library, override a template or set up a build step? Just ask.
