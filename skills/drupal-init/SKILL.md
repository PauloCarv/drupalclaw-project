---
name: drupal-init
description: Initialises a Drupal project in /workspace/drupal — new via Composer or existing via Git.
distribution: public
---

# drupal-init

Initialises the Drupal project in `/workspace/drupal`. Supports three scenarios:
- New project via Composer (drupal/recommended-project)
- Existing Git repository (clone from URL)
- Existing folder (warns and asks before overwriting)

---

## Step 1 — Check if project already exists

```bash
DRUPAL_DIR="/workspace/drupal"

if [[ -f "${DRUPAL_DIR}/composer.json" ]] && grep -q "drupal/core" "${DRUPAL_DIR}/composer.json"; then
  PROJECT_NAME=$(jq -r '.name // "unnamed"' "${DRUPAL_DIR}/composer.json" 2>/dev/null || echo "unknown")
  echo "⚠️  A Drupal project already exists at $DRUPAL_DIR"
  echo "   Name: $PROJECT_NAME"
  echo ""
  echo "❌ WARNING: Continuing will DELETE all files and the database!"
  echo "PROJECT_EXISTS=true"
  echo "PROJECT_NAME=$PROJECT_NAME"
elif [[ -d "${DRUPAL_DIR}" ]] && [[ "$(ls -A ${DRUPAL_DIR} 2>/dev/null | grep -v '^\.gitkeep$')" != "" ]]; then
  echo "⚠️  The folder $DRUPAL_DIR exists but does not appear to be a valid Drupal project."
  echo "PROJECT_EXISTS=partial"
else
  echo "PROJECT_EXISTS=false"
fi
```

**If PROJECT_EXISTS=true or partial**, ask the user and wait for their reply before continuing:

> **Content already exists in `/workspace/drupal` (`$PROJECT_NAME`). Delete everything and start fresh?**
> - `Yes` — deletes the directory and continues
> - `No` — cancels, preserves existing project
>
> Reply with: **Yes** or **No**

If the user answers `yes`:
```bash
# Stop stack if running
if [[ -f "/workspace/docker-compose.drupal.yml" ]]; then
  STACK_PROJECT=$(jq -r '.project_name // "drupal-dev"' /workspace/.piclaw/stack/state.json 2>/dev/null || echo "drupal-dev")
  docker compose -f /workspace/docker-compose.drupal.yml -p "$STACK_PROJECT" down -v 2>/dev/null || true
  echo "⏹️  Stack stopped and volumes removed."
fi
rm -rf "$DRUPAL_DIR"
mkdir -p "$DRUPAL_DIR"
echo "🗑️  Directory $DRUPAL_DIR cleared."
```

If the user answers `no` (default):
```bash
echo "ℹ️  Operation cancelled. Existing project preserved."
echo "   Use 'drupal-serve' to start the stack if it is not already running."
exit 0
```

**If PROJECT_EXISTS=false**, proceed directly to Step 2 without asking.

---

## Step 2 — Project type

Ask the user and wait for their reply before continuing:

> **How do you want to initialise the Drupal project?**
> - `New project` — install Drupal from scratch via Composer
> - `Existing Git repository` — clone from URL (GitHub, GitLab, Bitbucket, etc.)
>
> Reply with: **New project** or **Existing Git repository**

Save the choice as `INIT_TYPE=new` or `INIT_TYPE=git`.

---

## Step 3a — If INIT_TYPE=git: clone repository

Ask the user:

> What is the Git repository URL?
> (e.g. `https://github.com/user/my-drupal.git` or `git@github.com:user/my-drupal.git`)

```bash
# GIT_URL comes from the user's answer
GIT_URL="<provided URL>"

echo "🔄 Cloning repository..."
git clone "$GIT_URL" /workspace/drupal
cd /workspace/drupal

# Install dependencies if composer.json exists
if [[ -f "composer.json" ]]; then
  echo "📦 Installing Composer dependencies..."
  composer install --no-interaction
fi

echo "✅ Repository cloned successfully."
echo "INIT_DONE=true"
echo "NEEDS_COMPOSER=false"
```

After cloning, proceed to **Step 3c** (settings setup).

---

## Step 3b — If INIT_TYPE=new: create project via Composer

```bash
mkdir -p /workspace/drupal
cd /workspace/drupal
echo "📦 Creating Drupal project via Composer (may take a few minutes)..."
composer create-project drupal/recommended-project . --no-interaction
```

```bash
cd /workspace/drupal
echo "🔧 Installing Drush..."
composer require drush/drush --no-interaction
```

```bash
cd /workspace/drupal
echo "📦 Installing essential contrib modules..."
composer require drupal/admin_toolbar drupal/pathauto drupal/token drupal/metatag --no-interaction
```

```bash
cd /workspace/drupal
echo "INIT_DONE=true"
echo "NEEDS_COMPOSER=false"
```

After creating the project, proceed to **Step 3c** (settings setup).

---

## Step 3c — Configure settings.local.php

This step runs after both 3a and 3b. Sets up the correct local settings pattern: `settings.local.php` for environment-specific config (gitignored), with `settings.php` including it.

```bash
DRUPAL_DIR="/workspace/drupal"

# Detect Drupal web root (web/ docroot/ or flat)
if [[ -d "${DRUPAL_DIR}/web/sites/default" ]]; then
  SITES_DIR="${DRUPAL_DIR}/web/sites/default"
  WEB_ROOT="${DRUPAL_DIR}/web"
elif [[ -d "${DRUPAL_DIR}/docroot/sites/default" ]]; then
  SITES_DIR="${DRUPAL_DIR}/docroot/sites/default"
  WEB_ROOT="${DRUPAL_DIR}/docroot"
elif [[ -d "${DRUPAL_DIR}/sites/default" ]]; then
  SITES_DIR="${DRUPAL_DIR}/sites/default"
  WEB_ROOT="${DRUPAL_DIR}"
else
  echo "⚠️  Could not detect Drupal web root — skipping settings setup."
  exit 0
fi

echo "📁 Web root: $WEB_ROOT"
echo "📁 Sites dir: $SITES_DIR"

# Ensure settings.php exists (copy from default if missing)
if [[ ! -f "${SITES_DIR}/settings.php" ]]; then
  if [[ -f "${SITES_DIR}/default.settings.php" ]]; then
    cp "${SITES_DIR}/default.settings.php" "${SITES_DIR}/settings.php"
    echo "✅ settings.php created from default."
  else
    echo "⚠️  No default.settings.php found — cannot create settings.php."
    exit 0
  fi
fi
chmod 666 "${SITES_DIR}/settings.php"

# Activate settings.local.php include in settings.php
# (Drupal ships it commented out with #)
if grep -q "settings.local.php" "${SITES_DIR}/settings.php"; then
  # Uncomment the block if it's commented out
  python3 -c "
import re, sys
content = open('${SITES_DIR}/settings.php').read()
# Uncomment the settings.local.php include block
content = re.sub(r'# (if \(file_exists[^\n]*settings\.local\.php[^\n]*\))', r'\1', content)
content = re.sub(r'#   (include [^\n]*settings\.local\.php[^\n]*)', r'  \1', content)
content = re.sub(r'# (\})', r'\1', content)
open('${SITES_DIR}/settings.php', 'w').write(content)
print('done')
" 2>/dev/null && echo "✅ settings.local.php include activated in settings.php." || \
  echo "ℹ️  Could not auto-uncomment — check settings.php manually."
else
  # Append include at the end
  printf '\nif (file_exists($app_root . '"'"'/'"'"' . $site_path . '"'"'/settings.local.php'"'"')) {\n  include $app_root . '"'"'/'"'"' . $site_path . '"'"'/settings.local.php'"'"';\n}\n' >> "${SITES_DIR}/settings.php"
  echo "✅ settings.local.php include added to settings.php."
fi
```

```bash
DRUPAL_DIR="/workspace/drupal"
STATE_FILE="/workspace/.piclaw/stack/state.json"

# Detect web root again
if [[ -d "${DRUPAL_DIR}/web/sites/default" ]]; then
  SITES_DIR="${DRUPAL_DIR}/web/sites/default"
elif [[ -d "${DRUPAL_DIR}/docroot/sites/default" ]]; then
  SITES_DIR="${DRUPAL_DIR}/docroot/sites/default"
else
  SITES_DIR="${DRUPAL_DIR}/sites/default"
fi

# Skip if settings.local.php already exists with DB config
if [[ -f "${SITES_DIR}/settings.local.php" ]] && grep -q "databases\[" "${SITES_DIR}/settings.local.php" 2>/dev/null; then
  echo "ℹ️  settings.local.php already has DB config — skipping."
else
  # Read DB type from stack state
  DB_DRIVER="mysql"
  DB_HOST="db"
  DB_PORT="3306"
  DB_NAME="drupal"
  DB_USER="drupal"
  DB_PASS="drupal"

  if [[ -f "$STATE_FILE" ]]; then
    STACK_DB=$(jq -r '.db_type // "mariadb"' "$STATE_FILE" 2>/dev/null || echo "mariadb")
    case "$STACK_DB" in
      postgres) DB_DRIVER="pgsql"; DB_PORT="5432" ;;
      sqlite)   DB_DRIVER="sqlite" ;;
      *)        DB_DRIVER="mysql"; DB_PORT="3306" ;;
    esac
  fi

  if [[ "$DB_DRIVER" == "sqlite" ]]; then
    cat > "${SITES_DIR}/settings.local.php" << 'LOCALEOF'
<?php

$databases['default']['default'] = [
  'driver' => 'sqlite',
  'database' => '../sites/default/files/.sqlite',
  'prefix' => '',
  'namespace' => 'Drupal\\sqlite\\Driver\\Database\\sqlite',
  'autoload' => 'core/modules/sqlite/src/Driver/Database/sqlite/',
];
LOCALEOF
  else
    cat > "${SITES_DIR}/settings.local.php" << LOCALEOF
<?php

\$databases['default']['default'] = [
  'driver' => '${DB_DRIVER}',
  'database' => '${DB_NAME}',
  'username' => '${DB_USER}',
  'password' => '${DB_PASS}',
  'host' => '${DB_HOST}',
  'port' => '${DB_PORT}',
  'prefix' => '',
  'namespace' => 'Drupal\\\\${DB_DRIVER}\\\\Driver\\\\Database\\\\${DB_DRIVER}',
  'autoload' => 'core/modules/${DB_DRIVER}/src/Driver/Database/${DB_DRIVER}/',
];
LOCALEOF
  fi

  # Append local dev overrides
  cat >> "${SITES_DIR}/settings.local.php" << 'LOCALEOF'

// Local development settings — not safe for production.
$settings['skip_permissions_hardening'] = TRUE;
$settings['rebuild_access'] = TRUE;
$config['system.performance']['cache']['page']['use_internal'] = FALSE;
$config['system.performance']['css']['preprocess'] = FALSE;
$config['system.performance']['js']['preprocess'] = FALSE;
LOCALEOF

  chmod 644 "${SITES_DIR}/settings.local.php"
  echo "✅ settings.local.php created with ${DB_DRIVER} config (host: ${DB_HOST}:${DB_PORT})."
fi
```

```bash
DRUPAL_DIR="/workspace/drupal"

# Add settings.local.php to .gitignore
GITIGNORE="${DRUPAL_DIR}/.gitignore"
ENTRY="sites/default/settings.local.php"

if [[ -f "$GITIGNORE" ]]; then
  if ! grep -q "$ENTRY" "$GITIGNORE"; then
    echo "" >> "$GITIGNORE"
    echo "# Local settings — not committed" >> "$GITIGNORE"
    echo "$ENTRY" >> "$GITIGNORE"
    echo "✅ settings.local.php added to .gitignore"
  else
    echo "ℹ️  settings.local.php already in .gitignore"
  fi
else
  printf "# Local settings — not committed\n%s\n" "$ENTRY" > "$GITIGNORE"
  echo "✅ .gitignore created with settings.local.php entry"
fi
```

---

## Step 4 — Database import (optional)

Ask the user and wait for their reply before continuing:

> **Do you have a SQL dump to import?**
>
> Reply with: **Yes** (then provide the file path, e.g. `/workspace/backup.sql`) or **No**

**If yes**, ask for the path and run:

```bash
# SQL_FILE comes from the user's answer
SQL_FILE="<provided path>"

# Check if stack is running to import via container
STACK_RUNNING=false
STACK_PROJECT=$(jq -r '.project_name // "drupal-dev"' /workspace/.piclaw/stack/state.json 2>/dev/null || echo "drupal-dev")
if docker compose -f "/workspace/docker-compose.drupal.yml" -p "$STACK_PROJECT" ps --status running 2>/dev/null | grep -q "db"; then
  STACK_RUNNING=true
fi

if [[ "$STACK_RUNNING" == "true" ]]; then
  echo "📥 Importing SQL dump via Docker stack..."
  if [[ "$SQL_FILE" == *.gz ]]; then
    gunzip -c "$SQL_FILE" | docker compose -f /workspace/docker-compose.drupal.yml -p "$STACK_PROJECT" exec -T db mysql -udrupal -pdrupal drupal
  else
    docker compose -f /workspace/docker-compose.drupal.yml -p "$STACK_PROJECT" exec -T db mysql -udrupal -pdrupal drupal < "$SQL_FILE"
  fi
  echo "✅ Database imported."
else
  echo "⚠️  Stack not running — SQL import cannot be done now."
  echo "   Start the stack with 'drupal-serve' then import with 'drupal-db-import $SQL_FILE'."
fi
```

**If no**, continue.

---

## Step 5 — File import for sites/default/files (optional)

Ask the user and wait for their reply before continuing:

> **Do you have media/upload files to import?** (zip or tar.gz of `sites/default/files`)
>
> Reply with: **Yes** (then provide the archive path) or **No**

**If yes**, ask for the path and run:

```bash
# ARCHIVE_FILE comes from the user's answer
ARCHIVE_FILE="<provided path>"
FILES_DIR="/workspace/drupal/web/sites/default/files"

mkdir -p "$FILES_DIR"

echo "📂 Extracting files to $FILES_DIR..."
if [[ "$ARCHIVE_FILE" == *.tar.gz ]] || [[ "$ARCHIVE_FILE" == *.tgz ]]; then
  tar -xzf "$ARCHIVE_FILE" -C "$FILES_DIR" --strip-components=1 2>/dev/null || tar -xzf "$ARCHIVE_FILE" -C "$FILES_DIR"
elif [[ "$ARCHIVE_FILE" == *.zip ]]; then
  unzip -o "$ARCHIVE_FILE" -d "$FILES_DIR"
else
  echo "⚠️  Unrecognised format. Supported: .zip, .tar.gz, .tgz"
fi

# Fix permissions
chmod -R 755 "$FILES_DIR"
echo "✅ Files extracted to $FILES_DIR"
```

**If no**, continue.

---

## Step 6 — Prepare Docker structure

```bash
mkdir -p /workspace/.piclaw/stack
if [[ -d /home/agent/.pi/templates ]]; then
  cp /home/agent/.pi/templates/Dockerfile.php /workspace/.piclaw/stack/ 2>/dev/null || true
  cp /home/agent/.pi/templates/nginx.conf /workspace/.piclaw/stack/ 2>/dev/null || true
fi
echo "📦 Docker stack structure prepared in .piclaw/stack/"
```

---

## Step 7 — Check stack and report result

```bash
echo ""
echo "✅ Drupal project initialised in /workspace/drupal"
echo ""

# Check if stack is running
STACK_RUNNING=false
STATE_FILE="/workspace/.piclaw/stack/state.json"
STACK_PROJECT=$(jq -r '.project_name // "drupal-dev"' "$STATE_FILE" 2>/dev/null || echo "drupal-dev")
if [[ -f "$STATE_FILE" ]] && docker compose -f "/workspace/docker-compose.drupal.yml" -p "$STACK_PROJECT" ps --status running 2>/dev/null | grep -q "php"; then
  STACK_RUNNING=true
  STACK_URL=$(jq -r '.drupal_url // ""' "$STATE_FILE" 2>/dev/null)
fi

if [[ "$STACK_RUNNING" == "true" ]]; then
  echo "═══════════════════════════════════════════════"
  echo "✅ Stack is already running!"
  echo "   Complete the Drupal installation via browser:"
  echo "   🌐 $STACK_URL"
  echo ""
  echo "   Or install via drush (if you did not import a DB):"
  echo "   vendor/bin/drush site:install --db-url=mysql://drupal:drupal@db/drupal -y"
  echo "═══════════════════════════════════════════════"
else
  echo "═══════════════════════════════════════════════"
  echo "👉 Next step: start the Docker stack"
  echo "   Use 'drupal-serve' to start the containers (PHP + nginx + DB)."
  echo "   DB options: mariadb (recommended) | postgres | sqlite"
  echo ""
  echo "   Once the stack is running, complete the installation via browser"
  echo "   or with: vendor/bin/drush site:install -y"
  echo "═══════════════════════════════════════════════"
fi

# Signal the UI file tree to auto-refresh
mkdir -p /workspace/.piclaw/signals
touch /workspace/.piclaw/signals/tree-refresh
```

---

## Step 8 — Didactic block

```bash
INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
echo "INTERACTION_MODE=$INTERACTION_MODE"
```

If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

💡 **How to replicate manually:**
```bash
composer create-project drupal/recommended-project /workspace/drupal
cd /workspace/drupal && composer require drush/drush
cp web/sites/default/default.settings.php web/sites/default/settings.php
# Create settings.local.php with DB credentials, then include it from settings.php
```
Want a step-by-step explanation of the Drupal project structure? Just ask.
