---
name: jira-issues
description: Lists Jira issues with filters (project, status, assignee). Requires active session (jira-check).
distribution: private
---

# jira-issues

Lists corporate Jira issues via REST API with session cookie.

## Parameters (optional, extracted from context or asked)

- `PROJECT` — project key (default: $JIRA_PROJECT_KEY from env)
- `STATUS` — status to filter: "In Progress", "To Do", "Done", etc. (default: all open)
- `ASSIGNEE` — "currentUser()" for mine, or specific username (default: all)
- `MAX` — maximum number of results (default: 20)

## Steps

1. Load environment and validate session:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   [[ ! -f "$ENV_FILE" ]] && echo "❌ File $ENV_FILE not found." && exit 1
   source "$ENV_FILE"

   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")
   [[ "$HTTP_STATUS" != "200" ]] && echo "⚠️  Cookie expired (HTTP $HTTP_STATUS). Use jira-check to renew." && exit 1
   ```

2. Build JQL and call the API:
   ```bash
   PROJECT="${PROJECT:-$JIRA_PROJECT_KEY}"
   MAX="${MAX:-20}"

   # Build JQL dynamically
   JQL="project = $PROJECT"
   [[ -n "$STATUS" ]] && JQL="$JQL AND status = \"$STATUS\""
   [[ -n "$ASSIGNEE" ]] && JQL="$JQL AND assignee = $ASSIGNEE"
   [[ -z "$STATUS" ]] && JQL="$JQL AND statusCategory != Done"
   JQL="$JQL ORDER BY updated DESC"

   RESPONSE=$(curl -s \
     -H "Cookie: $JIRA_COOKIE" \
     -H "Content-Type: application/json" \
     "$JIRA_BASE_URL/rest/api/2/search?jql=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$JQL")&maxResults=$MAX&fields=summary,status,assignee,priority,updated")

   TOTAL=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))")
   echo "📋 Issues ($TOTAL total, showing up to $MAX):"
   echo ""
   echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for issue in d.get('issues', []):
    key = issue['key']
    summary = issue['fields']['summary']
    status = issue['fields']['status']['name']
    assignee = issue['fields'].get('assignee') or {}
    assignee_name = assignee.get('displayName', 'Unassigned')
    priority = issue['fields'].get('priority') or {}
    priority_name = priority.get('name', '-')
    print(f'  [{key}] {summary}')
    print(f'    Status: {status} | Assignee: {assignee_name} | Priority: {priority_name}')
    print()
"
   ```
