---
name: jira-check
description: Checks whether the Jira session is active and the cookie is valid. Instructs renewal if expired.
distribution: private
---

# jira-check

Validates the corporate Jira session (session cookie authentication).

## Steps

1. Check if the environment file exists:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   if [[ ! -f "$ENV_FILE" ]]; then
     echo "❌ File $ENV_FILE not found."
     echo "   Ask the user to configure the Jira integration."
     exit 1
   fi
   source "$ENV_FILE"
   ```

2. Test the cookie against a simple endpoint:
   ```bash
   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")

   if [[ "$HTTP_STATUS" == "200" ]]; then
     # Show authenticated user without revealing the cookie
     USER_INFO=$(curl -s \
       -H "Cookie: $JIRA_COOKIE" \
       "$JIRA_BASE_URL/rest/api/2/myself" | grep -o '"displayName":"[^"]*"' | head -1)
     echo "✅ Jira session active — $USER_INFO"
     echo "   URL: $JIRA_BASE_URL"
     echo "   Default project: $JIRA_PROJECT_KEY"
   elif [[ "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "403" ]]; then
     echo "⚠️  Jira cookie expired (HTTP $HTTP_STATUS)."
     echo ""
     echo "To renew:"
     echo "  1. Open Jira in your browser: $JIRA_BASE_URL"
     echo "  2. Log in if required"
     echo "  3. Open DevTools (F12) → Application → Cookies"
     echo "  4. Copy the values of: JSESSIONID, atlassian.xsrf.token, INGRESSCOOKIE"
     echo "     (and ApplicationGatewayAffinity, ApplicationGatewayAffinityCORS if present)"
     echo "  5. Share the values and I will update $ENV_FILE"
     exit 1
   else
     echo "❌ Unexpected error contacting Jira (HTTP $HTTP_STATUS)"
     echo "   URL: $JIRA_BASE_URL"
     exit 1
   fi
   ```
