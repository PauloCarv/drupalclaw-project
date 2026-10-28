---
name: drupal-theme
description: Creates a Drupal theme the way the developer wants it — Starterkit copy, sub-theme of an existing or contrib theme, or minimal — with regions, styling tooling, components, settings and template overrides.
distribution: public
---

# drupal-theme

An assistant for creating a custom theme in `web/themes/custom/<name>`. It first discovers what the project
already has, then asks the developer how the theme should be built, then generates exactly that.
Nothing is enabled as default/admin theme, and no npm or Composer package is installed, without confirmation.

## Steps

1. Resolve the PHP container (container vs local):
   ```bash
   STACK_STATE="/workspace/.piclaw/stack/state.json"
   if [[ ! -f "$STACK_STATE" ]]; then
     echo "❌ No Drupal stack configured for this workspace. Run 'drupal-serve' first."; exit 1
   fi
   PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE")
   PHP_CONTAINER=$(docker ps --filter "status=running" \
     --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
     --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     RUN="docker exec -i -w /var/www/html $PHP_CONTAINER"
   elif [[ -x "/workspace/drupal/vendor/bin/drush" ]]; then
     cd /workspace/drupal; RUN=""
   else
     echo "❌ Stack '${PROJECT_NAME}' is not running. Run 'drupal-serve' to start it."; exit 1
   fi
   DRUSH="$RUN vendor/bin/drush"
   ROOT="/workspace/drupal"
   CORE_VERSION=$($DRUSH status --field=drupal-version 2>/dev/null)
   echo "🐳 ${PROJECT_NAME:-local} · Drupal $CORE_VERSION"
   ```

2. Discover what the project has — this drives the options offered in the next step:
   ```bash
   echo "=== Installed themes (name | status | path) ==="
   $DRUSH pm:list --type=theme --format=json 2>/dev/null \
     | jq -r 'to_entries[] | "\(.key) | \(.value.status) | \(.value.path)"'
   echo "=== Current default / admin theme ==="
   $DRUSH config:get system.theme default --format=string 2>/dev/null
   $DRUSH config:get system.theme admin --format=string 2>/dev/null
   echo "=== Starterkits available (themes with a *.starterkit.yml) ==="
   find "$ROOT/web/core/themes" "$ROOT/web/themes" -name '*.starterkit.yml' 2>/dev/null \
     | sed 's|.*/||; s|\.starterkit\.yml$||'
   echo "=== Custom themes ==="; ls "$ROOT/web/themes/custom" 2>/dev/null || echo "(none)"
   echo "=== Contrib themes ==="; ls "$ROOT/web/themes/contrib" 2>/dev/null || echo "(none)"
   command -v npm >/dev/null && echo "npm: available" || echo "npm: not available in this container"
   ```

3. Interview the developer in **one** message, using what was discovered (list real theme names, mark the
   recommended option, show the default for each question). Skip anything the user already answered.
   If the user says "defaults" or "just do it", use the defaults.

   1. **Name**: machine name, label, short description.
   1. **Starting point** (default: A):
      - **A. Starterkit copy** — a standalone theme the developer owns; core updates never break it.
        Offer every starterkit found (default `starterkit_theme`).
      - **B. Sub-theme of an installed theme** — a custom theme, a contrib theme, or a core theme. For
        Olivero/Claro, warn: core marks them `@internal`, their markup changes between minor releases, and
        sub-theming is only recommended for small tweaks.
      - **C. Sub-theme of a contrib base theme not installed yet** (e.g. Bootstrap 5, Radix, Gin): install
        it first with `drupal-install`, then read its README — if it documents its own sub-theme generator,
        use that instead of step 5B.
      - **D. Minimal theme from scratch** (`base theme: false`): only `.info.yml`, libraries and regions.
   1. **Role** (default: front-end): front-end, administration, or both. Set it as default/admin now?
      (default: no).
   1. **Regions** (default: keep the source theme's regions): keep, or give a custom list.
   1. **Styling** (default: plain CSS): plain CSS, SCSS, PostCSS or Tailwind.
   1. **Extras** (default: none, any combination): Single Directory Components with an example component;
      theme settings form; breakpoints; template overrides (which templates); custom logo/favicon.

4. Validate the machine name (must not exist as any theme or module):
   ```bash
   THEME="${THEME:?machine name}"
   [[ "$THEME" =~ ^[a-z][a-z0-9_]*$ ]] || { echo "❌ Invalid machine name '$THEME'."; exit 1; }
   DIR="$ROOT/web/themes/custom/$THEME"
   [[ -d "$DIR" ]] && { echo "⚠ $DIR already exists."; exit 1; }
   if $DRUSH pm:list --format=json 2>/dev/null | jq -e --arg t "$THEME" 'has($t)' >/dev/null; then
     echo "❌ An extension named '$THEME' already exists in this site."; exit 1
   fi
   mkdir -p "$ROOT/web/themes/custom"
   ```

5. Generate according to the chosen starting point.

   **A. Starterkit** (`--path` is relative to the web root; Drupal 11.4+ ships `vendor/bin/dr`):
   ```bash
   if $RUN test -x vendor/bin/dr; then GEN="$RUN vendor/bin/dr"; else GEN="$RUN php web/core/scripts/drupal"; fi
   $GEN generate-theme "$THEME" --name "$LABEL" --description "$DESC" \
     --starterkit "${STARTERKIT:-starterkit_theme}" --path themes/custom
   ```

   **B / C. Sub-theme of `$BASE`** — copy the base theme's regions so they are not lost
   (a sub-theme that declares no regions falls back to Drupal's defaults, not the base theme's):
   ```bash
   BASE_PATH=$($DRUSH pm:list --type=theme --format=json | jq -r --arg b "$BASE" '.[$b].path // empty')
   [[ -z "$BASE_PATH" ]] && { echo "❌ Base theme '$BASE' is not installed."; exit 1; }
   BASE_INFO="$ROOT/web/$BASE_PATH/$BASE.info.yml"
   mkdir -p "$DIR/css" "$DIR/templates"
   {
     echo "name: '$LABEL'"
     echo "type: theme"
     echo "description: '$DESC'"
     echo "core_version_requirement: ^10 || ^11"
     echo "base theme: $BASE"
     echo "libraries:"
     echo "  - $THEME/global-styling"
     awk '/^regions:/{f=1;print;next} f&&/^[^ #]/{f=0} f' "$BASE_INFO"
   } > "$DIR/$THEME.info.yml"
   ```

   **D. Minimal**: same as B/C but with `base theme: false` and a regions block of `header`, `content`,
   `sidebar`, `footer` (or the user's list).

   For B, C and D also create:
   ```bash
   cat > "$DIR/$THEME.libraries.yml" << EOF
   global-styling:
     css:
       theme:
         css/style.css: {}
   EOF
   echo "/* $LABEL global styles */" > "$DIR/css/style.css"
   printf '<?php\n\n/**\n * @file\n * Functions to support theming in the %s theme.\n */\n' "$LABEL" > "$DIR/$THEME.theme"
   ```
   If the user gave a custom regions list, replace the `regions:` block in `$THEME.info.yml` with it
   (show the diff first).

6. Extras (only the ones the user chose):

   - **SCSS / PostCSS / Tailwind**: create `package.json` with `build` and `watch` scripts that compile into
     `css/style.css`, and the source file (`scss/style.scss`, `src/style.css`…). Ask before running
     `npm install --save-dev <packages>` in `$DIR` (no pinned versions; npm resolves the latest). If npm is
     not available, leave the scaffold and tell the user how to build it on the host.
   - **Single Directory Components**: create `components/<name>/<name>.component.yml`, `<name>.twig` and
     `<name>.css`. SDC is part of core since 10.3; on 10.1–10.2 enable it with `$DRUSH en sdc -y`.
     The component is used as `{{ include('THEME:<name>', { … }) }}`. Verify discovery:
     ```bash
     $DRUSH php:eval "print implode(PHP_EOL, array_keys(\Drupal::service('plugin.manager.sdc')->getDefinitions()));" | grep "^$THEME:"
     ```
   - **Theme settings**: `theme-settings.php` implementing `hook_form_system_theme_settings_alter()`,
     defaults in `config/install/$THEME.settings.yml`, and `config/schema/$THEME.schema.yml` declaring
     `$THEME.settings` as `type: theme_settings` with a mapping for each setting.
   - **Breakpoints**: `$THEME.breakpoints.yml` with `$THEME.mobile|tablet|desktop` entries (`label`,
     `mediaQuery`, `weight`, `multipliers: ['1x']`).
   - **Template overrides**: for each template the user named, copy the closest existing version (source
     theme first, then its base themes, then core) into `templates/`:
     ```bash
     find "$ROOT/web/themes" "$ROOT/web/core/themes" "$ROOT/web/core/modules" -name "$TEMPLATE.html.twig" 2>/dev/null
     ```
     Tell the user to enable Twig development mode at `/admin/config/development/settings` to see
     template suggestions while working.
   - **Logo/favicon**: copy the files the user provides into the theme and set `logo`/`favicon` in theme
     settings, or keep the defaults.

7. Enable and apply the role (default/admin only when the user said so):
   ```bash
   $DRUSH theme:enable "$THEME"
   [[ "$SET_DEFAULT" == "yes" ]] && $DRUSH config:set system.theme default "$THEME" -y
   [[ "$SET_ADMIN" == "yes" ]] && $DRUSH config:set system.theme admin "$THEME" -y
   $DRUSH cache:rebuild
   ```

8. Verify:
   ```bash
   $DRUSH pm:list --type=theme --format=json | jq -r --arg t "$THEME" '.[$t] | "\(.name) | \(.status) | \(.path)"'
   URL=$(jq -r '.internal_url // empty' "$STACK_STATE")
   [[ -n "$URL" ]] && echo "Front page: HTTP $(curl -s -o /dev/null -w '%{http_code}' "$URL/")"
   if $RUN test -x vendor/bin/phpcs; then
     $RUN vendor/bin/phpcs --standard=Drupal,DrupalPractice --extensions=php,theme,yml "web/themes/custom/$THEME"
   fi
   ```
   If the front page is not 200 after making the theme default, show `drupal-logs` output and offer to
   revert with `$DRUSH config:set system.theme default <previous> -y`.

9. Report a table: starting point, base theme, role, regions, styling, extras, enabled/default/admin,
   front page status. Suggest next steps (template work, components, `drupal-contrib` to publish it).

10. Didactic block:
    ```bash
    INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
    echo "INTERACTION_MODE=$INTERACTION_MODE"
    ```

    If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

    💡 **How to replicate manually:**
    ```bash
    php web/core/scripts/drupal generate-theme <name> --name "<Label>" --path themes/custom
    # or a sub-theme: <name>.info.yml with "base theme: <base>" and the base's regions
    vendor/bin/drush theme:enable <name>
    vendor/bin/drush config:set system.theme default <name> -y   # optional
    ```
    Starterkit gives you a copy you own; a sub-theme inherits from its base and follows its changes.
    Want to override a template, add a component or set up a build step? Just ask.
