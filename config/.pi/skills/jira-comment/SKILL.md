---
name: jira-comment
description: Adds a comment to a Jira issue. Requires ISSUE_KEY and COMMENT.
distribution: private
---

# jira-comment

Adds a comment to a corporate Jira issue.

## Parameters (required)

- `ISSUE_KEY` — issue key (e.g. CFENABL2-123)
- `COMMENT` — comment text

## Steps

1. Load environment and validate session:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   [[ ! -f "$ENV_FILE" ]] && echo "❌ File $ENV_FILE not found." && exit 1
   source "$ENV_FILE"

   [[ -z "$ISSUE_KEY" ]] && echo "❌ Parameter ISSUE_KEY is required." && exit 1
   [[ -z "$COMMENT" ]] && echo "❌ Parameter COMMENT is required." && exit 1

   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")
   [[ "$HTTP_STATUS" != "200" ]] && echo "⚠️  Cookie expired (HTTP $HTTP_STATUS). Use jira-check to renew." && exit 1
   ```

2. Submit comment:
   ```bash
   PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'body': sys.argv[1]}))" "$COMMENT")

   RESPONSE=$(curl -s -w "\n%{http_code}" \
     -X POST \
     -H "Cookie: $JIRA_COOKIE" \
     -H "Content-Type: application/json" \
     -d "$PAYLOAD" \
     "$JIRA_BASE_URL/rest/api/2/issue/$ISSUE_KEY/comment")

   HTTP_CODE=$(echo "$RESPONSE" | tail -1)
   BODY=$(echo "$RESPONSE" | head -n -1)

   if [[ "$HTTP_CODE" == "201" ]]; then
     COMMENT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))")
     echo "✅ Comment added to $ISSUE_KEY (id: $COMMENT_ID)"
   else
     echo "❌ Error adding comment (HTTP $HTTP_CODE)"
     echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errorMessages', d))" 2>/dev/null || echo "$BODY"
     exit 1
   fi
   ```
