---
name: jira-status
description: Transiciona o estado de um issue do Jira (ex: To Do → In Progress). Requer ISSUE_KEY e STATUS_NAME.
distribution: private
---

# jira-status

Muda o estado de um issue do Jira via transição.

## Parâmetros (obrigatórios)

- `ISSUE_KEY` — chave do issue (ex: CFENABL2-123)
- `STATUS_NAME` — nome do estado destino (ex: "In Progress", "Done", "To Do")

## Steps

1. Carregar ambiente e validar sessão:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   [[ ! -f "$ENV_FILE" ]] && echo "❌ Ficheiro $ENV_FILE não encontrado." && exit 1
   source "$ENV_FILE"

   [[ -z "$ISSUE_KEY" ]] && echo "❌ Parâmetro ISSUE_KEY obrigatório." && exit 1
   [[ -z "$STATUS_NAME" ]] && echo "❌ Parâmetro STATUS_NAME obrigatório." && exit 1

   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")
   [[ "$HTTP_STATUS" != "200" ]] && echo "⚠️  Cookie expirado (HTTP $HTTP_STATUS). Usa jira-check para renovar." && exit 1
   ```

2. Obter transições disponíveis para o issue:
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
     echo "❌ Estado '$STATUS_NAME' não encontrado para $ISSUE_KEY."
     echo "Estados disponíveis:"
     echo "$TRANSITIONS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for t in d.get('transitions', []):
    print(f\"  - {t['to']['name']} (id: {t['id']})\")
"
     exit 1
   fi
   ```

3. Executar a transição:
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
     echo "❌ Erro na transição (HTTP $HTTP_CODE)"
     exit 1
   fi
   ```
