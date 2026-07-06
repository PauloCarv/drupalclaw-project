---
name: drupal-index
description: Indexes the Drupal codebase into a GitNexus knowledge graph and registers it as an MCP server, so the agent can query code relationships instead of exploring file by file.
distribution: public
---

# drupal-index

Builds a code intelligence index of the Drupal project using [GitNexus](https://github.com/abhigyanpatwari/GitNexus) and registers it as an MCP server. Once active, the agent can answer architecture/dependency questions (who calls this service, blast radius of changing this class) with a single MCP query instead of several sequential `grep`/`find`/`cat` calls.

**Scope rule: this skill only ever indexes `/workspace/drupal`. Never index `/workspace` root, `/config`, or any other path.**

## Steps

### 1. Check prerequisites

```bash
if ! command -v npx &>/dev/null; then
  echo "❌ Node.js/npx not available in this container."
  exit 1
fi

DRUPAL_DIR="/workspace/drupal"
if [[ ! -f "${DRUPAL_DIR}/composer.json" ]] || ! grep -q "drupal/core" "${DRUPAL_DIR}/composer.json"; then
  echo "❌ No Drupal project found at $DRUPAL_DIR."
  echo "   Run 'drupal-init' first."
  exit 1
fi
echo "✅ Drupal project found at $DRUPAL_DIR"
```

### 2. Build or update the index

```bash
echo "📊 Indexing Drupal codebase (first run can take several minutes — progress will stream below)..."
npx -y gitnexus@latest analyze "$DRUPAL_DIR" 2>&1
echo "✅ Index updated for $DRUPAL_DIR"
```

If the user explicitly asks for a full rebuild (e.g. after a large refactor, or if query results look stale), use `--force` instead:

```bash
echo "📊 Re-indexing Drupal codebase (full rebuild)..."
npx -y gitnexus@latest analyze "$DRUPAL_DIR" --force 2>&1
echo "✅ Index rebuilt for $DRUPAL_DIR"
```

### 3. Register the MCP server

Read before write — never overwrite `mcp.json` blindly:

```bash
MCP_CONFIG="/workspace/.pi/mcp.json"
mkdir -p /workspace/.pi
if [[ ! -f "$MCP_CONFIG" ]]; then
  echo '{"mcpServers":{}}' > "$MCP_CONFIG"
fi
cat "$MCP_CONFIG"
```

Merge in the `gitnexus` entry (read the current content above first, then write back the merged result):

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

```bash
echo "✅ GitNexus registered as MCP server in $MCP_CONFIG"
echo "   Use /restart in the chat to activate it."
```

### 4. Didactic block

```bash
INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
echo "INTERACTION_MODE=$INTERACTION_MODE"
```

If INTERACTION_MODE is `learning`, output the following block. If `expert`, skip it entirely.

💡 **How to replicate manually:**
```bash
npx -y gitnexus@latest analyze /workspace/drupal
# add the gitnexus entry to /workspace/.pi/mcp.json, then run /restart
```
Want to understand which queries become available (call graphs, impact analysis)? Just ask.
