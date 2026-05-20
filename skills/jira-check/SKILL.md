---
name: jira-check
description: Verifica se a sessão Jira está activa e o cookie é válido. Instrui renovação se expirado.
distribution: private
---

# jira-check

Valida a sessão Jira corporativa (autenticação por cookie de sessão).

## Steps

1. Verificar se o ficheiro de ambiente existe:
   ```bash
   ENV_FILE="/workspace/.pi/jira.env"
   if [[ ! -f "$ENV_FILE" ]]; then
     echo "❌ Ficheiro $ENV_FILE não encontrado."
     echo "   Pede ao utilizador para configurar a integração Jira."
     exit 1
   fi
   source "$ENV_FILE"
   ```

2. Testar o cookie com um endpoint simples:
   ```bash
   HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: $JIRA_COOKIE" \
     "$JIRA_BASE_URL/rest/api/2/myself")

   if [[ "$HTTP_STATUS" == "200" ]]; then
     # Mostrar utilizador autenticado sem revelar o cookie
     USER_INFO=$(curl -s \
       -H "Cookie: $JIRA_COOKIE" \
       "$JIRA_BASE_URL/rest/api/2/myself" | grep -o '"displayName":"[^"]*"' | head -1)
     echo "✅ Sessão Jira activa — $USER_INFO"
     echo "   URL: $JIRA_BASE_URL"
     echo "   Projecto padrão: $JIRA_PROJECT_KEY"
   elif [[ "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "403" ]]; then
     echo "⚠️  Cookie Jira expirado (HTTP $HTTP_STATUS)."
     echo ""
     echo "Para renovar:"
     echo "  1. Abre o Jira no browser: $JIRA_BASE_URL"
     echo "  2. Faz login se necessário"
     echo "  3. Abre DevTools (F12) → Application → Cookies"
     echo "  4. Copia os valores de: JSESSIONID, atlassian.xsrf.token, INGRESSCOOKIE"
     echo "     (e ApplicationGatewayAffinity, ApplicationGatewayAffinityCORS se existirem)"
     echo "  5. Diz-me os valores e eu actualizo o $ENV_FILE"
     exit 1
   else
     echo "❌ Erro inesperado ao contactar Jira (HTTP $HTTP_STATUS)"
     echo "   URL: $JIRA_BASE_URL"
     exit 1
   fi
   ```
