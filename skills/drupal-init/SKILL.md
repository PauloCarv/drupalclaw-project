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

**If PROJECT_EXISTS=true or partial**, ask the user before continuing:

> Content already exists in `/workspace/drupal` (`$PROJECT_NAME`).
> Do you want to **delete everything and start fresh**?
> - `yes` — deletes the directory and continues
> - `no` — cancels (default)

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

Ask the user:

> How do you want to initialise the Drupal project?
>
> 1. **New project** — install Drupal from scratch via Composer
> 2. **Existing Git repository** — clone from URL (GitHub, GitLab, Bitbucket, etc.)

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

After cloning, proceed to **Step 4** (data import).

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
if [[ -f web/sites/default/default.settings.php ]]; then
  cp web/sites/default/default.settings.php web/sites/default/settings.php
  chmod 666 web/sites/default/settings.php
  echo "✅ settings.php created."
fi
echo "INIT_DONE=true"
echo "NEEDS_COMPOSER=false"
```

---

## Step 4 — Database import (optional)

Ask the user:

> Do you have a SQL dump to import?
> - `yes` — provide the file path (e.g. `/workspace/backup.sql` or `/workspace/backup.sql.gz`)
> - `no` — continue without importing

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

Ask the user:

> Do you have media/upload files to import? (zip or tar.gz of `sites/default/files`)
> - `yes` — provide the archive path
> - `no` — continue

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
