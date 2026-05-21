---
name: jira-status
description: Transitions a Jira issue status (e.g. To Do → In Progress). Requires ISSUE_KEY and STATUS_NAME.
distribution: private
---

# jira-status

Changes a Jira issue status via transition.

## Parameters (required)

- `ISSUE_KEY` — issue key (e.g. CFENABL2-123)
- `STATUS_NAME` — target status name (e.g. "In Progress", "Done", "To Do")

## Steps

1. Load environment and validate session:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   [[ ! -f "$ENV_FILE" ]] && echo "❌ File $ENV_FILE not found." && exit 1
   source "$ENV_FILE"

   [[ -z "$ISSUE_KEY" ]] && echo "❌ Parameter ISSUE_KEY is required." && exit 1
   [[ -z "$STATUS_NAME" ]] && echo "❌ Parameter STATUS_NAME is required." && exit 1

   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")
   [[ "$HTTP_STATUS" != "200" ]] && echo "⚠️  Cookie expired (HTTP $HTTP_STATUS). Use jira-check to renew." && exit 1
   ```

2. Get available transitions for the issue:
   ```bash
   TRANSITIONS=$(curl -s \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/issue/$ISSUE_KEY/transitions")

   TRANSITION_ID=$(echo "$TRANSITIONS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
target = sys.argv[1].lower()
for t in d.get('transitions', []):
    if t['to']['name'].lower() == target or t['name'].lower() == target:
        print(t['id'])
        break
" "$STATUS_NAME" 2>/dev/null)

   if [[ -z "$TRANSITION_ID" ]]; then
     echo "❌ Status '$STATUS_NAME' not found for $ISSUE_KEY."
     echo "Available statuses:"
     echo "$TRANSITIONS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for t in d.get('transitions', []):
    print(f\"  - {t['to']['name']} (id: {t['id']})\")
"
     exit 1
   fi
   ```

3. Execute the transition:
   ```bash
   PAYLOAD="{\"transition\":{\"id\":\"$TRANSITION_ID\"}}"

   HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
     -X POST \
     -H "Cookie: $JIRA_COOKIE" \
     -H "Content-Type: application/json" \
     -d "$PAYLOAD" \
     "$JIRA_BASE_URL/rest/api/2/issue/$ISSUE_KEY/transitions")

   if [[ "$HTTP_CODE" == "204" ]]; then
     echo "✅ $ISSUE_KEY → '$STATUS_NAME'"
   else
     echo "❌ Transition error (HTTP $HTTP_CODE)"
     exit 1
   fi
   ```
