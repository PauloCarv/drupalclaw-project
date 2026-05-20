---
name: jira-issues
description: Lista issues do Jira com filtros (projecto, estado, assignee). Requer sessão activa (jira-check).
distribution: private
---

# jira-issues

Lista issues do Jira corporativo via REST API com cookie de sessão.

## Parâmetros (opcionais, extraídos do contexto ou perguntados)

- `PROJECT` — chave do projecto (default: $JIRA_PROJECT_KEY do env)
- `STATUS` — estado a filtrar: "In Progress", "To Do", "Done", etc. (default: todos em aberto)
- `ASSIGNEE` — "currentUser()" para os meus, ou username específico (default: todos)
- `MAX` — número máximo de resultados (default: 20)

## Steps

1. Carregar ambiente e validar sessão:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   [[ ! -f "$ENV_FILE" ]] && echo "❌ Ficheiro $ENV_FILE não encontrado." && exit 1
   source "$ENV_FILE"

   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")
   [[ "$HTTP_STATUS" != "200" ]] && echo "⚠️  Cookie expirado (HTTP $HTTP_STATUS). Usa jira-check para renovar." && exit 1
   ```

2. Construir JQL e chamar a API:
   ```bash
   PROJECT="${PROJECT:-$JIRA_PROJECT_KEY}"
   MAX="${MAX:-20}"

   # Construir JQL dinamicamente
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
   echo "📋 Issues ($TOTAL total, a mostrar até $MAX):"
   echo ""
   echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for issue in d.get('issues', []):
    key = issue['key']
    summary = issue['fields']['summary']
    status = issue['fields']['status']['name']
    assignee = issue['fields'].get('assignee') or {}
    assignee_name = assignee.get('displayName', 'Não atribuído')
    priority = issue['fields'].get('priority') or {}
    priority_name = priority.get('name', '-')
    print(f'  [{key}] {summary}')
    print(f'    Estado: {status} | Assignee: {assignee_name} | Prioridade: {priority_name}')
    print()
"
   ```
