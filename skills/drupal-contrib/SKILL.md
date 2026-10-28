---
name: drupal-contrib
description: Audits a custom module or theme and prepares it for contribution to drupal.org — metadata, composer.json, README, GitLab CI, config schema, tests, coding standards — then guides publication or a new release.
distribution: public
---

# drupal-contrib

Takes a module or theme from `web/modules/custom` / `web/themes/custom` and gets it ready to be a contributed
project on drupal.org. It audits first, shows the findings, fixes only what the developer approves, and then
guides the publication or the next release.

**Never push code, create tags, create a project or release, or touch drupal.org accounts on your own.**
Every step that leaves this workspace is done by the developer, or by you only after the developer confirms
that exact step. Never ask for or handle drupal.org credentials. Never overwrite an existing file without
showing the diff and getting a yes. Never invent version constraints: ask.

## Step 1 — Resolve the PHP container and locate the project

```bash
STACK_STATE="/workspace/.piclaw/stack/state.json"
PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE" 2>/dev/null)
PHP_CONTAINER=""
[[ -n "$PROJECT_NAME" ]] && PHP_CONTAINER=$(docker ps --filter "status=running" \
  --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
if [[ -n "$PHP_CONTAINER" ]]; then
  RUN="docker exec -i -w /var/www/html $PHP_CONTAINER"
else
  cd /workspace/drupal; RUN=""
  echo "ℹ Stack not running: checks that need PHP tools run only if available locally."
fi
DRUSH="$RUN vendor/bin/drush"
ROOT="/workspace/drupal"
CORE_VERSION=$($DRUSH status --field=drupal-version 2>/dev/null)
echo "Drupal core: ${CORE_VERSION:-unknown}"
echo "=== Custom modules ===";  ls "$ROOT/web/modules/custom" 2>/dev/null || echo "(none)"
echo "=== Custom themes ===";   ls "$ROOT/web/themes/custom"  2>/dev/null || echo "(none)"
```

If the developer did not name a project, list the candidates above and ask which one. If it does not exist
yet, offer `drupal-module` (module) or `drupal-theme` (theme) first.

```bash
NAME="${NAME:?machine name}"
NAME=$(echo "$NAME" | tr '-' '_' | tr '[:upper:]' '[:lower:]')
[[ "$NAME" =~ ^[a-z][a-z0-9_]*$ ]] || { echo "❌ Invalid machine name '$NAME'."; exit 1; }
DIR=""
for base in modules themes; do [[ -f "$ROOT/web/$base/custom/$NAME/$NAME.info.yml" ]] && DIR="$ROOT/web/$base/custom/$NAME"; done
[[ -z "$DIR" ]] && { echo "❌ $NAME not found in web/modules/custom or web/themes/custom."; exit 1; }
INFO="$DIR/$NAME.info.yml"
TYPE=$(sed -n "s/^type: *//p" "$INFO" | head -1 | tr -d "'\" ")
REL="${DIR#$ROOT/}"
echo "📦 $NAME ($TYPE) at $REL"
```

`TYPE` is `module`, `theme` or `profile`. Modules and themes are handled below; for a `profile` (distribution)
explain that it needs extra steps and offer to continue manually.

## Step 2 — Is the name free on drupal.org?

```bash
CODE=$(curl -s -L -o /dev/null -w '%{http_code}' --max-time 15 "https://www.drupal.org/project/$NAME")
case "$CODE" in
  404) echo "✅ drupal.org/project/$NAME is free." ;;
  200) echo "⚠ drupal.org/project/$NAME already exists." ;;
  *)   echo "ℹ Could not verify (HTTP $CODE). Check https://www.drupal.org/project/$NAME manually." ;;
esac
```

If it already exists, **ask**: *Is this your own project (you are a maintainer) and this is a new release,
or is it a different project that happens to share the name?*
- **Own project / maintainer** → mode `RELEASE`: skip project creation in Step 9 and go to branches and tags.
- **Someone else's** → mode `NEW`: a machine name can never be reused. Suggest 2–3 alternative names, or
  offer to contribute to the existing project (issue queue + merge request) instead of publishing a copy.
- Name free → mode `NEW`.

## Step 3 — Audit the metadata

```bash
echo "=== $NAME.info.yml ==="
grep -q '^core_version_requirement:' "$INFO" && echo "✅ core_version_requirement: $(sed -n 's/^core_version_requirement: *//p' "$INFO")" \
  || echo "❌ core_version_requirement missing (e.g. ^10.3 || ^11)"
grep -q '^description:' "$INFO" && echo "✅ description" || echo "❌ description missing"
grep -qE '^(version|project|datestamp):' "$INFO" && echo "⚠ Remove version/project/datestamp — drupal.org packaging adds them"
grep -qiE "^package: *'?\"?Custom" "$INFO" && echo "⚠ package is 'Custom' — use a meaningful group (or remove it)"
grep -q '^name:' "$INFO" && echo "✅ name" || echo "❌ name missing"
# dependencies must be namespaced: drupal:node or project:module
sed -n '/^dependencies:/,/^[^ -]/p' "$INFO" | grep -E '^ *- ' | grep -v ':' \
  && echo "❌ Dependencies above are not namespaced (use drupal:node or project:module)"
[[ "$TYPE" == "theme" ]] && { [[ -f "$DIR/screenshot.png" ]] && echo "✅ screenshot.png" || echo "⚠ screenshot.png missing (shown on the Appearance page)"; }
```

Also check, and report in the audit:
- **Compatibility with installed core**: the installed `$CORE_VERSION` must satisfy
  `core_version_requirement`.
- **Module only — `configure:`**: if the module has a settings form route (grep `routing.yml` for a form
  class ending in `SettingsForm` or a path under `/admin/config`) and `configure:` is missing in the
  `.info.yml`, suggest `configure: <route_name>`.
- **Module only — `hook_help()`**: if `$NAME.module` has no `hook_help`, suggest one for `help.page.$NAME`
  that points to the README.
- **Contrib dependencies**: every `project:module` entry whose project is not `drupal` is a contrib
  dependency; list them for Step 4.

Fix the findings the developer approves, showing each diff before writing.

## Step 4 — composer.json

drupal.org builds the Composer package from this file.

```bash
case "$TYPE" in module) CTYPE="drupal-module" ;; theme) CTYPE="drupal-theme" ;; esac
DESC=$(sed -n "s/^description: *['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}$/\1/p" "$INFO" | head -1)
if [[ ! -f "$DIR/composer.json" ]]; then
  jq -n --arg n "drupal/$NAME" --arg t "$CTYPE" --arg d "$DESC" \
    '{name:$n, type:$t, description:$d, license:"GPL-2.0-or-later", require:{}}' > "$DIR/composer.json"
  echo "➕ composer.json"
else
  jq -r --arg n "drupal/$NAME" --arg t "$CTYPE" '
    (if .name != $n then "❌ name should be \($n) (is \(.name))" else "✅ name" end),
    (if .type != $t then "❌ type should be \($t) (is \(.type))" else "✅ type" end),
    (if (.license // "") | test("GPL-2.0") then "✅ license" else "❌ license should be GPL-2.0-or-later" end),
    (if (.require // {} | has("drupal/core")) then "⚠ do not require drupal/core — core_version_requirement in the .info.yml covers it" else "✅ no drupal/core requirement" end)' \
    "$DIR/composer.json"
fi
```

For each contrib dependency found in Step 3 (`project:module`), **ask the developer for the version
constraint** (e.g. the one the module was developed against) and add `"drupal/<project>": "<constraint>"` to
`require`. Never guess constraints. Validate the result: `$RUN composer validate --no-check-publish "$REL/composer.json"`.

## Step 5 — README, CI and optional files

Add only what is missing. The CI file is the official Drupal Association template (`project/gitlab_templates`):

```bash
if [[ ! -f "$DIR/.gitlab-ci.yml" ]]; then
cat > "$DIR/.gitlab-ci.yml" << 'EOF'
include:
  - project: $_GITLAB_TEMPLATES_REPO
    ref: $_GITLAB_TEMPLATES_REF
    file:
      - '/includes/include.drupalci.main.yml'
      - '/includes/include.drupalci.variables.yml'
      - '/includes/include.drupalci.workflows.yml'
EOF
echo "➕ .gitlab-ci.yml"
fi
```

If `README.md` is missing, write it following the drupal.org README template: project name as the only `#`
heading, sentence-case `##` headings, text wrapped at ~80 columns, `-` bullets, `1.` for every ordered item,
two blank lines before each `##`. Required sections: introduction, Requirements, Installation, Configuration.
Optional: Recommended modules, Troubleshooting & FAQ, Maintainers. Fill it from the code (routes,
permissions, config forms, dependencies, regions and libraries for a theme); do not invent features, and ask
for the maintainer names. Do not add a `LICENSE.txt`: everything on drupal.org is GPL-2.0-or-later and the
license is declared in `composer.json`.

## Step 6 — Config schema

If `config/install` or `config/optional` exist:

```bash
for f in "$DIR"/config/install/*.yml "$DIR"/config/optional/*.yml; do
  [[ -f "$f" ]] || continue
  key=$(basename "$f" .yml)
  grep -rqs "^${key%%.*}\.\|^${key}:" "$DIR"/config/schema/*.schema.yml 2>/dev/null \
    && echo "✅ schema for $key" || echo "❌ no schema entry for $key in config/schema/*.schema.yml"
done
```

Missing schema makes config export/import and the Kernel tests fail. Offer to write the schema (top-level
key = config name, `type: config_object`, a `mapping:` entry per key with `type` and `label`). For a theme,
settings use `<theme>.settings` with `type: theme_settings`.

## Step 7 — Tests

If `tests/` does not exist, offer a minimal starting point (drupal.org's CI runs PHPUnit):

- **Module** — `tests/src/Kernel/<Name>ModuleTest.php`:
  ```php
  <?php

  namespace Drupal\Tests\NAME\Kernel;

  use Drupal\KernelTests\KernelTestBase;

  /**
   * Tests that the module installs cleanly.
   *
   * @group NAME
   */
  class NameModuleTest extends KernelTestBase {

    /**
     * {@inheritdoc}
     */
    protected static $modules = ['NAME'];

    /**
     * Tests that the module is enabled.
     */
    public function testModuleIsEnabled(): void {
      $this->assertTrue($this->container->get('module_handler')->moduleExists('NAME'));
    }

  }
  ```
- **Theme** — `tests/src/Functional/<Name>ThemeTest.php` extending `BrowserTestBase` with
  `protected $defaultTheme = 'NAME';` that loads the front page and asserts HTTP 200.

Replace `NAME`/`Name` with the real machine/class names. If the project has PHPUnit
(`$RUN test -x vendor/bin/phpunit`), offer to run the test; otherwise say the tests will run on drupal.org CI.

## Step 8 — Coding standards and deprecations

```bash
if $RUN test -x vendor/bin/phpcs; then
  $RUN vendor/bin/phpcs --standard=Drupal,DrupalPractice \
    --extensions=php,module,inc,install,test,profile,theme,info,txt,md,yml "$REL" 2>&1 | tail -40
else
  echo "⚠ phpcs (drupal/coder) not installed — run 'drupal-analyze' to install it, then re-run this step."
fi
$RUN test -x vendor/bin/phpstan && $RUN vendor/bin/phpstan analyse "$REL" --level=5 --no-progress 2>&1 | tail -30
```

Offer to fix what is reported (`drupal-fix` handles the PHPCBF-fixable part). Contrib code is reviewed
against these standards: aim for zero errors. For a deeper deprecation scan before a major core update, offer
the contrib module `drupal/upgrade_status` — only install it if the developer agrees.

## Step 9 — Report, then guide publication

Show a checklist table (✅ / ⚠ / ❌ with what is left): name free, `.info.yml`, `composer.json`, README,
`.gitlab-ci.yml`, config schema, tests, PHPCS, PHPStan, compatibility with the installed core.

Then give the steps for the detected mode. Show them; run nothing that leaves the workspace without an
explicit yes.

**Mode `NEW`**
1. Set up Git for drupal.org: <https://www.drupal.org/docs/develop/git/setting-up-git-for-drupal>.
1. Create the project at <https://www.drupal.org/project/add>: **Module project** or **Theme project**
   (matching `$TYPE`). If asked for sandbox vs full, choose **Full project** (sandboxes are deprecated).
1. On the project's **Version control** tab, copy the remote commands. The project directory is the
   repository root. Branch names follow `{major}.x` or `{major}.{minor}.x`, e.g. `1.0.x`.
   Offer to initialise locally (only after a yes):
   ```bash
   cd "$DIR" && git init -b 1.0.x && git add . && git commit -m "Initial commit"
   ```
1. Tag with three version parts, e.g. `1.0.0` (pre-releases `1.0.0-alpha1`, `-beta1`, `-rc1`), then push the tag.
1. On the project page use **Add new release**, select the tag and write the release notes. Releases are
   created on drupal.org, not in GitLab, and cannot be edited after publishing.
1. Optional: apply once for permission to opt projects into security advisory coverage
   (<https://www.drupal.org/docs/develop/managing-a-drupalorg-theme-module-or-distribution-project/security-coverage/opting-into>);
   only stable releases are covered.

**Mode `RELEASE`** (existing project you maintain)
1. Work on the matching branch (`1.0.x`, `1.1.x`…), commit, push.
1. Pick the next version with semantic versioning (patch for fixes, minor for features, major for breaking
   changes) and tag it (`git tag 1.0.1 && git push origin 1.0.1`).
1. **Add new release** on the project page and write the notes (changes since the last tag:
   `git log --oneline <last-tag>..HEAD`; offer to draft them).

## Step 10 — Didactic block

```bash
INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
echo "INTERACTION_MODE=$INTERACTION_MODE"
```

If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

💡 **How to replicate manually:**
```bash
# In the project directory: composer.json (drupal/<name>, drupal-module|drupal-theme, GPL-2.0-or-later),
# README.md (drupal.org template), .gitlab-ci.yml (include project/gitlab_templates)
vendor/bin/phpcs --standard=Drupal,DrupalPractice <path>
git init -b 1.0.x && git tag 1.0.0    # push using the project's Version control tab
```
Want help with the release notes, the config schema or the security coverage application? Just ask.
