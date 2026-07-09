---
name: drupal-marketplace
description: Install skills and MCP servers from any marketplace URL. Supports drupalclaw-marketplace.json, sdlc-plugins, Copilot instructions, and OpenAI assistant formats.
distribution: public
---

# drupal-marketplace

Fetches a marketplace catalog from a URL and installs skills (SKILL.md format) or MCP servers into the workspace. Skills are namespaced as `<slug>-<name>` to avoid collisions. Supports multiple source formats with automatic detection.

**Commands:**
- `drupal-marketplace list <url>` — show available skills and MCP servers
- `drupal-marketplace add <url>` — fetch catalog and install (interactive)
- `drupal-marketplace remove <slug>` — remove all skills from a marketplace
- `drupal-marketplace installed` — list installed marketplace skills

---

## Steps

### 1. Parse command and URL

```bash
MARKETPLACE_CMD="${1:-add}"
MARKETPLACE_URL="${2:-}"

if [[ -z "$MARKETPLACE_URL" && "$MARKETPLACE_CMD" != "installed" ]]; then
  echo "❌ Usage: drupal-marketplace <list|add|remove|installed> [url]"
  exit 1
fi

SKILLS_DIR="/workspace/.pi/skills"
MCP_CONFIG="/workspace/.pi/mcp.json"
REGISTRY_FILE="/workspace/.pi/marketplace-registry.json"
mkdir -p "$SKILLS_DIR" /workspace/.pi
```

### 2. Handle `installed` command

```bash
if [[ "$MARKETPLACE_CMD" == "installed" ]]; then
  echo "📦 Installed marketplace skills:"
  if [[ -f "$REGISTRY_FILE" ]]; then
    cat "$REGISTRY_FILE" | jq -r '.marketplaces[] | "  • \(.slug) (\(.url))"' 2>/dev/null || echo "  (none)"
  else
    echo "  (none)"
  fi
  echo ""
  echo "Skills:"
  for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    if [[ "$skill_name" == *"-"* ]]; then
      echo "  • $skill_name"
    fi
  done
  exit 0
fi
```

### 3. Handle `remove` command

```bash
if [[ "$MARKETPLACE_CMD" == "remove" ]]; then
  SLUG="$MARKETPLACE_URL"
  echo "🗑️  Removing all skills from marketplace: $SLUG"
  count=0
  for skill_dir in "$SKILLS_DIR"/${SLUG}-*/; do
    if [[ -d "$skill_dir" ]]; then
      rm -rf "$skill_dir"
      echo "  ✓ Removed $(basename "$skill_dir")"
      count=$((count + 1))
    fi
  done
  # Remove from registry
  if [[ -f "$REGISTRY_FILE" ]]; then
    tmp=$(jq --arg slug "$SLUG" '.marketplaces = [.marketplaces[] | select(.slug != $slug)]' "$REGISTRY_FILE")
    echo "$tmp" > "$REGISTRY_FILE"
  fi
  echo "✅ Removed $count skills from $SLUG"
  echo "   Run /restart to deregister them from the agent."
  exit 0
fi
```

### 4. Detect format and fetch manifest

```bash
echo "🔍 Fetching marketplace from: $MARKETPLACE_URL"

# Detect sdlc-plugins format (GitHub repo with plugins/ structure)
if echo "$MARKETPLACE_URL" | grep -q "sdlc-plugins"; then
  FORMAT="sdlc-plugins"
  # Extract owner/repo from URL
  REPO=$(echo "$MARKETPLACE_URL" | sed 's|https://github.com/||' | sed 's|\.git||')
  echo "  Detected: sdlc-plugins format (GitHub: $REPO)"
else
  FORMAT="drupalclaw"
  # Try to fetch drupalclaw-marketplace.json
  # Check common manifest paths
  for path in "drupalclaw-marketplace.json" "marketplace.json" ".drupalclaw/marketplace.json"; do
    MANIFEST_URL="${MARKETPLACE_URL%/}/$path"
    MANIFEST=$(curl -sL --max-time 10 "$MANIFEST_URL" 2>/dev/null)
    if echo "$MANIFEST" | jq -e '.skills or .mcpServers' >/dev/null 2>&1; then
      echo "  Found manifest at: $MANIFEST_URL"
      break
    fi
    MANIFEST=""
  done
  if [[ -z "$MANIFEST" ]]; then
    echo "❌ Could not find a valid marketplace manifest at $MARKETPLACE_URL"
    echo "   Expected: drupalclaw-marketplace.json with {name, slug, skills[], mcpServers[]}"
    exit 1
  fi
fi
```

### 5. Parse manifest and extract slug

```bash
if [[ "$FORMAT" == "drupalclaw" ]]; then
  SLUG=$(echo "$MANIFEST" | jq -r '.slug // "marketplace"')
  MARKETPLACE_NAME=$(echo "$MANIFEST" | jq -r '.name // "Marketplace"')
  AUTH_TYPE=$(echo "$MANIFEST" | jq -r '.auth // "none"')
  SKILL_COUNT=$(echo "$MANIFEST" | jq '.skills | length' 2>/dev/null || echo 0)
  MCP_COUNT=$(echo "$MANIFEST" | jq '.mcpServers | length' 2>/dev/null || echo 0)
elif [[ "$FORMAT" == "sdlc-plugins" ]]; then
  SLUG=$(echo "$REPO" | awk -F'/' '{print $2}' | sed 's/[^a-z0-9-]/-/g')
  MARKETPLACE_NAME="$REPO"
  AUTH_TYPE="github-pat"
  SKILL_COUNT=0  # will be computed per plugin
fi

echo ""
echo "📦 Marketplace: $MARKETPLACE_NAME (slug: $SLUG)"
```

### 6. Auth check (for private marketplaces)

```bash
ENV_FILE="/workspace/.pi/marketplace-${SLUG}.env"
MARKETPLACE_TOKEN=""

if [[ "$AUTH_TYPE" == "token" || "$AUTH_TYPE" == "github-pat" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    source "$ENV_FILE"
    MARKETPLACE_TOKEN="${MARKETPLACE_TOKEN:-}"
    echo "  🔑 Auth token found for $SLUG"
  else
    echo ""
    echo "  🔐 This marketplace requires a token."
    if [[ "$AUTH_TYPE" == "github-pat" ]]; then
      echo "  Create a GitHub Personal Access Token with 'repo' scope at:"
      echo "  https://github.com/settings/tokens"
    fi
    echo ""
    echo "  Paste your token below and press Enter:"
    read -r -s input_token
    if [[ -z "$input_token" ]]; then
      echo "❌ No token provided. Aborting."
      exit 1
    fi
    echo "MARKETPLACE_TOKEN=$input_token" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    MARKETPLACE_TOKEN="$input_token"
    echo "  ✅ Token saved to $ENV_FILE (gitignored)"
  fi
fi

# Set auth header for curl
CURL_AUTH=""
if [[ -n "$MARKETPLACE_TOKEN" ]]; then
  CURL_AUTH="-H \"Authorization: Bearer $MARKETPLACE_TOKEN\""
  if [[ "$AUTH_TYPE" == "github-pat" ]]; then
    CURL_AUTH="-H \"Authorization: token $MARKETPLACE_TOKEN\""
  fi
fi
```

### 7. List mode — show catalog and exit

```bash
if [[ "$MARKETPLACE_CMD" == "list" ]]; then
  if [[ "$FORMAT" == "drupalclaw" ]]; then
    echo ""
    echo "Skills ($SKILL_COUNT):"
    echo "$MANIFEST" | jq -r '.skills[]? | "  • \(.name) — \(.description)"' 2>/dev/null
    echo ""
    echo "MCP Servers ($MCP_COUNT):"
    echo "$MANIFEST" | jq -r '.mcpServers[]? | "  • \(.name) — \(.description)"' 2>/dev/null
  elif [[ "$FORMAT" == "sdlc-plugins" ]]; then
    echo "  Fetching plugin list from GitHub..."
    PLUGINS=$(curl -sL $CURL_AUTH "https://api.github.com/repos/$REPO/contents/plugins" | jq -r '.[].name' 2>/dev/null)
    echo ""
    echo "Plugins:"
    echo "$PLUGINS" | while read -r plugin; do
      echo "  • $plugin"
    done
  fi
  exit 0
fi
```

### 8. Add mode — interactive install

For `drupalclaw` format: present skills and MCP servers with selection.

For each skill selected, detect the source format and install:

**Install a skill from drupalclaw manifest:**
```bash
install_skill_from_url() {
  local name="$1"
  local url="$2"
  local format="${3:-skill.md}"
  local slug="$4"

  local target_dir="$SKILLS_DIR/${slug}-${name}"
  mkdir -p "$target_dir"

  case "$format" in
    skill.md)
      # Direct copy
      curl -sL $CURL_AUTH "$url" -o "$target_dir/SKILL.md"
      # Update frontmatter name to include namespace
      sed -i "s/^name: .*/name: ${slug}-${name}/" "$target_dir/SKILL.md"
      echo "  ✅ Installed skill: ${slug}-${name}"
      ;;
    copilot)
      # Fetch Copilot instructions and wrap in SKILL.md
      INSTRUCTIONS=$(curl -sL $CURL_AUTH "$url")
      cat > "$target_dir/SKILL.md" <<SKILLEOF
---
name: ${slug}-${name}
description: ${name} (from ${slug} marketplace)
distribution: public
---

# ${name}

${INSTRUCTIONS}
SKILLEOF
      echo "  ✅ Installed skill (Copilot format): ${slug}-${name}"
      ;;
    openai|codex)
      # Fetch JSON and extract instructions — agent will convert
      ASSISTANT=$(curl -sL $CURL_AUTH "$url")
      INSTRUCTIONS=$(echo "$ASSISTANT" | jq -r '.instructions // .system_prompt // ""')
      ASSISTANT_NAME=$(echo "$ASSISTANT" | jq -r '.name // "'$name'"')
      cat > "$target_dir/SKILL.md" <<SKILLEOF
---
name: ${slug}-${name}
description: ${ASSISTANT_NAME} (converted from OpenAI/Codex format)
distribution: public
---

# ${ASSISTANT_NAME}

${INSTRUCTIONS}
SKILLEOF
      echo "  ✅ Installed skill (OpenAI format): ${slug}-${name}"
      ;;
  esac
}
```

**Install MCP server from drupalclaw manifest:**
```bash
install_mcp_from_manifest() {
  local entry="$1"
  local id=$(echo "$entry" | jq -r '.id')
  local command=$(echo "$entry" | jq -r '.command')
  local args=$(echo "$entry" | jq -r '.args')

  # Read-first, never overwrite
  if [[ ! -f "$MCP_CONFIG" ]]; then
    echo '{"mcpServers":{}}' > "$MCP_CONFIG"
  fi

  local current=$(cat "$MCP_CONFIG")
  local updated=$(echo "$current" | jq \
    --arg id "$id" \
    --argjson server "{\"command\":\"$command\",\"args\":$args}" \
    '.mcpServers[$id] = $server')
  echo "$updated" > "$MCP_CONFIG"
  echo "  ✅ Added MCP server: $id (restart container to activate)"
}
```

**For sdlc-plugins format:**
```bash
install_sdlc_plugin() {
  local plugin="$1"
  echo "  📥 Installing plugin: $plugin"

  # Fetch plugin.json
  PLUGIN_JSON=$(curl -sL $CURL_AUTH "https://api.github.com/repos/$REPO/contents/plugins/$plugin/plugin.json" | jq -r '.content' | base64 -d)
  SKILL_PATHS=$(echo "$PLUGIN_JSON" | jq -r '.skills[]?' 2>/dev/null)

  echo "$SKILL_PATHS" | while read -r skill_path; do
    skill_name=$(basename "$skill_path")
    SKILL_CONTENT=$(curl -sL $CURL_AUTH "https://api.github.com/repos/$REPO/contents/plugins/$plugin/$skill_path/SKILL.md" | jq -r '.content' | base64 -d)
    target_dir="$SKILLS_DIR/${SLUG}-${skill_name}"
    mkdir -p "$target_dir"
    echo "$SKILL_CONTENT" > "$target_dir/SKILL.md"
    sed -i "s/^name: .*/name: ${SLUG}-${skill_name}/" "$target_dir/SKILL.md"
    echo "  ✅ Installed: ${SLUG}-${skill_name}"
  done
}
```

### 9. Register marketplace and finish

```bash
# Update registry
if [[ ! -f "$REGISTRY_FILE" ]]; then
  echo '{"marketplaces":[]}' > "$REGISTRY_FILE"
fi

ENTRY="{\"slug\":\"$SLUG\",\"name\":\"$MARKETPLACE_NAME\",\"url\":\"$MARKETPLACE_URL\",\"installedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
UPDATED=$(jq --argjson entry "$ENTRY" --arg slug "$SLUG" '
  .marketplaces = [.marketplaces[] | select(.slug != $slug)] + [$entry]
' "$REGISTRY_FILE")
echo "$UPDATED" > "$REGISTRY_FILE"

echo ""
echo "✅ Marketplace installed: $MARKETPLACE_NAME"
echo "   Run /restart in the chat to activate new skills."
```

### 10. Didactic block

```bash
INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
```

If INTERACTION_MODE is `learning`, output:

💡 **How to replicate manually:**
```bash
# Install a skill manually from a URL:
mkdir -p /workspace/.pi/skills/my-skill
curl -sL https://example.com/SKILL.md -o /workspace/.pi/skills/my-skill/SKILL.md
# Then /restart in chat

# View installed marketplace skills:
cat /workspace/.pi/marketplace-registry.json | jq .
```
