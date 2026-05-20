---
name: jira-comment
description: Adiciona um comentário a um issue do Jira. Requer ISSUE_KEY e COMMENT.
distribution: private
---

# jira-comment

Adiciona um comentário a um issue do Jira corporativo.

## Parâmetros (obrigatórios)

- `ISSUE_KEY` — chave do issue (ex: CFENABL2-123)
- `COMMENT` — texto do comentário

## Steps

1. Carregar ambiente e validar sessão:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   [[ ! -f "$ENV_FILE" ]] && echo "❌ Ficheiro $ENV_FILE não encontrado." && exit 1
   source "$ENV_FILE"

   [[ -z "$ISSUE_KEY" ]] && echo "❌ Parâmetro ISSUE_KEY obrigatório." && exit 1
   [[ -z "$COMMENT" ]] && echo "❌ Parâmetro COMMENT obrigatório." && exit 1

   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")
   [[ "$HTTP_STATUS" != "200" ]] && echo "⚠️  Cookie expirado (HTTP $HTTP_STATUS). Usa jira-check para renovar." && exit 1
   ```

2. Submeter comentário:
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
     echo "✅ Comentário adicionado ao $ISSUE_KEY (id: $COMMENT_ID)"
   else
     echo "❌ Erro ao adicionar comentário (HTTP $HTTP_CODE)"
     echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errorMessages', d))" 2>/dev/null || echo "$BODY"
     exit 1
   fi
   ```
