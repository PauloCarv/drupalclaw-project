---
name: drupal-contrib
description: Prepares a custom module for contribution to drupal.org and guides its publication.
distribution: public
---

# drupal-contrib

Gets a module in `web/modules/custom/<name>` ready to publish as a contributed project on drupal.org:
checks the metadata, adds the files drupal.org expects, runs coding standards, and walks through publication.

**Never push code, create tags or create anything on drupal.org on your own.** Every step that leaves this
workspace (git push, tags, creating the project or a release) is done by the user, or by you only after the
user explicitly confirms that exact step. Never ask for or handle drupal.org credentials.

## Steps

1. Ask which module to prepare (if not provided):
   - If the user named it, use it.
   - If it does not exist yet, offer to scaffold it first with `drupal-module`, then continue.

2. Resolve the PHP container (container vs local):
   ```bash
   STACK_STATE="/workspace/.piclaw/stack/state.json"
   PROJECT_NAME=$(jq -r '.project_name // empty' "$STACK_STATE" 2>/dev/null)
   PHP_CONTAINER=""
   if [[ -n "$PROJECT_NAME" ]]; then
     PHP_CONTAINER=$(docker ps \
       --filter "status=running" \
       --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
       --format '{{.Names}}' 2>/dev/null | grep -iE "php|fpm" | head -1)
   fi
   if [[ -n "$PHP_CONTAINER" ]]; then
     echo "🐳 Stack: ${PROJECT_NAME} ($PHP_CONTAINER)"
     RUN="docker exec -i -w /var/www/html $PHP_CONTAINER"
   else
     cd /workspace/drupal
     RUN=""
     echo "ℹ Stack not running; checks that need PHP tools will run locally if available."
   fi
   ```

3. Locate and validate the module:
   ```bash
   MODULE_NAME="${1:?module machine name required}"
   MODULE_NAME=$(echo "$MODULE_NAME" | tr '-' '_' | tr '[:upper:]' '[:lower:]')
   MODULE_DIR="/workspace/drupal/web/modules/custom/$MODULE_NAME"
   REL_DIR="web/modules/custom/$MODULE_NAME"
   INFO="$MODULE_DIR/$MODULE_NAME.info.yml"
   if [[ ! "$MODULE_NAME" =~ ^[a-z][a-z0-9_]*$ ]]; then
     echo "❌ Invalid machine name '$MODULE_NAME'."; exit 1
   fi
   if [[ ! -f "$INFO" ]]; then
     echo "❌ $INFO not found. Scaffold the module first (drupal-module $MODULE_NAME)."; exit 1
   fi
   echo "📦 Module: $MODULE_DIR"
   ```

4. Check whether the machine name is free on drupal.org (a project name cannot be reused):
   ```bash
   CODE=$(curl -s -L -o /dev/null -w '%{http_code}' --max-time 15 "https://www.drupal.org/project/$MODULE_NAME")
   case "$CODE" in
     404) echo "✅ drupal.org/project/$MODULE_NAME is free." ;;
     200) echo "⚠ drupal.org/project/$MODULE_NAME already exists. Pick another machine name, or offer to co-maintain that project." ;;
     *)   echo "ℹ Could not verify the name on drupal.org (HTTP $CODE). Check https://www.drupal.org/project/$MODULE_NAME manually." ;;
   esac
   ```

5. Check the `.info.yml`:
   ```bash
   grep -q '^core_version_requirement:' "$INFO" && echo "✅ core_version_requirement set" \
     || echo "❌ Add core_version_requirement (e.g. ^10 || ^11)"
   grep -q '^description:' "$INFO" && echo "✅ description set" || echo "❌ Add a description"
   grep -q '^version:' "$INFO" && echo "⚠ Remove 'version:' — drupal.org packaging adds it to releases"
   grep -qi "^package: *'\?Custom" "$INFO" && echo "⚠ package is 'Custom' — use a meaningful group or remove it"
   ```
   Fix the issues reported above in the `.info.yml` (show the diff to the user before writing).

6. Add the files drupal.org expects. Never overwrite a file that already exists.
   ```bash
   LABEL=$(sed -n "s/^name: *['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}$/\1/p" "$INFO" | head -1)
   DESC=$(sed -n "s/^description: *['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}$/\1/p" "$INFO" | head -1)
   LABEL="${LABEL:-$MODULE_NAME}"

   # composer.json — drupal.org builds the Composer package from it
   if [[ ! -f "$MODULE_DIR/composer.json" ]]; then
     jq -n --arg n "drupal/$MODULE_NAME" --arg d "$DESC" \
       '{name: $n, type: "drupal-module", description: $d, license: "GPL-2.0-or-later", require: {}}' \
       > "$MODULE_DIR/composer.json"
     echo "➕ composer.json"
   fi

   # .gitlab-ci.yml — official Drupal Association template (project/gitlab_templates)
   if [[ ! -f "$MODULE_DIR/.gitlab-ci.yml" ]]; then
     cat > "$MODULE_DIR/.gitlab-ci.yml" << 'EOF'
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

   If `README.md` is missing, write it following the drupal.org README template: the project name as the
   only `#` heading, sentence-case `##` headings, text wrapped at ~80 columns, `-` bullets, `1.` for every
   ordered item, two blank lines before each `##`. Required sections: introduction, Requirements,
   Installation, Configuration. Optional: Recommended modules, Troubleshooting & FAQ, Maintainers.
   Fill the content from the module's code (routes, permissions, config forms, dependencies); do not invent
   features. Ask the user for the maintainer names. Example skeleton:
   ```markdown
   # <Label>

   <What the module does and why, 2-4 lines.>

   For a full description of the module, visit the
   [project page](https://www.drupal.org/project/<machine_name>).

   Submit bug reports and feature suggestions, or track changes in the
   [issue queue](https://www.drupal.org/project/issues/<machine_name>).


   ## Requirements

   This module requires no modules outside of Drupal core.


   ## Installation

   Install as you would normally install a contributed Drupal module. For further
   information, see
   [Installing Drupal Modules](https://www.drupal.org/docs/extending-drupal/installing-drupal-modules).


   ## Configuration

   1. Enable the module at Administration > Extend.
   1. <Where to configure it, if anything.>


   ## Maintainers

   - <Name> - [<drupal.org username>](https://www.drupal.org/u/<username>)
   ```

   Do not add a `LICENSE.txt`: all code on drupal.org is GPL-2.0-or-later, and the license is declared in
   `composer.json`.

7. Coding standards on this module only:
   ```bash
   if $RUN test -x vendor/bin/phpcs; then
     $RUN vendor/bin/phpcs --standard=Drupal,DrupalPractice \
       --extensions=php,module,inc,install,test,profile,theme,info,txt,md,yml "$REL_DIR" 2>&1 | tail -30
   else
     echo "⚠ phpcs not installed — run 'drupal-analyze' to install drupal/coder, then re-run this step."
   fi
   if $RUN test -x vendor/bin/phpstan; then
     $RUN vendor/bin/phpstan analyse "$REL_DIR" --level=5 --no-progress 2>&1 | tail -20
   fi
   ```
   Offer to fix what is reported (`drupal-fix` handles the PHPCBF-fixable part). Contrib projects are
   reviewed against these standards, so aim for zero errors.

8. Report a checklist table: name free on drupal.org, `.info.yml`, `composer.json`, `README.md`,
   `.gitlab-ci.yml`, PHPCS, PHPStan — each ✅ / ⚠ / ❌ with what is left to do.

9. Publication guide (manual steps — show them, do not run them without explicit confirmation):

   1. Set up Git for drupal.org:
      [Setting up Git for Drupal](https://www.drupal.org/docs/develop/git/setting-up-git-for-drupal).
   1. Create the project at <https://www.drupal.org/project/add> → **Module project**. If the form offers a
      project type, choose **Full project** (sandboxes are deprecated).
   1. Push the code using the commands on the project's **Version control** tab. The module directory is the
      repository root. Branch names follow `{major}.x` or `{major}.{minor}.x`, e.g. `1.0.x`.
   1. Tag a release with all three version parts, e.g. `1.0.0` (pre-releases: `1.0.0-alpha1`,
      `1.0.0-beta1`, `1.0.0-rc1`), and push the tag:
      ```bash
      git tag 1.0.0
      git push origin 1.0.0
      ```
   1. On the drupal.org project page, use **Add new release**, select the tag and write the release notes.
      Releases are created on drupal.org, not in GitLab, and cannot be edited after publishing.
   1. Optional: apply once for permission to opt projects into **security advisory coverage**
      ([how to apply](https://www.drupal.org/docs/develop/managing-a-drupalorg-theme-module-or-distribution-project/security-coverage/opting-into)).
      Only stable releases are covered.

   If the user wants to initialise the repository locally, offer (and only run after confirmation):
   ```bash
   cd "$MODULE_DIR" && git init -b 1.0.x && git add . && git commit -m "Initial commit"
   ```

10. Didactic block:
    ```bash
    INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
    echo "INTERACTION_MODE=$INTERACTION_MODE"
    ```

    If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

    💡 **How to replicate manually:**
    ```bash
    # In web/modules/custom/<name>:
    # - composer.json with name drupal/<name>, type drupal-module, license GPL-2.0-or-later
    # - README.md following the drupal.org README template
    # - .gitlab-ci.yml including the project/gitlab_templates files
    vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom/<name>
    git init -b 1.0.x && git tag 1.0.0   # push using the project's Version control tab
    ```
    Want help with the release notes or the security coverage application? Just ask.
