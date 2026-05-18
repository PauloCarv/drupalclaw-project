---
name: drupal-init
description: Cria um novo projecto Drupal via Composer com configuração recomendada.
distribution: public
---

# drupal-init

Cria um novo projecto Drupal usando o template recomendado.

## Steps

1. Verificar se já existe um projecto Drupal:
   ```bash
   DRUPAL_DIR="/workspace/drupal"
   [[ ! -d "$DRUPAL_DIR" ]] && DRUPAL_DIR="/workspace"

   if [[ -f "${DRUPAL_DIR}/composer.json" ]] && grep -q "drupal/core" "${DRUPAL_DIR}/composer.json"; then
     PROJECT_NAME=$(jq -r '.name // "sem nome"' "${DRUPAL_DIR}/composer.json" 2>/dev/null || echo "desconhecido")
     echo "⚠️  Já existe um projecto Drupal neste directório."
     echo "   Nome: $PROJECT_NAME"
     echo "   Path: $DRUPAL_DIR"
     echo ""
     echo "❌ ATENÇÃO: Continuar vai APAGAR todos os ficheiros e a base de dados!"
   fi
   ```

   Perguntar ao utilizador:

   > Já existe um projecto Drupal em `$DRUPAL_DIR`.
   > Queres **apagar tudo e começar do zero**?
   > - `sim` — apaga o directório e reinicia (dados perdidos)
   > - `não` — cancela (padrão)

   Se o utilizador responder `sim`:
   ```bash
   # Parar stack se estiver a correr
   if [[ -f "/workspace/docker-compose.drupal.yml" ]]; then
     docker compose -f /workspace/docker-compose.drupal.yml -p drupal-dev down -v 2>/dev/null || true
     echo "⏹️  Stack parada e volumes removidos."
   fi
   # Apagar projecto
   rm -rf "$DRUPAL_DIR"
   echo "🗑️  Directório $DRUPAL_DIR apagado."
   ```

   Se o utilizador responder `não` ou não responder:
   ```bash
   echo "ℹ️  Operação cancelada. Projecto existente preservado."
   echo "   Usa 'drupal-serve' para iniciar a stack."
   exit 0
   ```

2. Criar projecto via Composer:
   ```bash
   composer create-project drupal/recommended-project . --no-interaction
   ```

3. Instalar Drush localmente:
   ```bash
   composer require drush/drush --no-interaction
   ```

4. Instalar módulos contrib essenciais:
   ```bash
   composer require drupal/admin_toolbar drupal/pathauto drupal/token drupal/metatag --no-interaction
   ```

5. Configurar settings.php para desenvolvimento:
   ```bash
   if [[ -f web/sites/default/default.settings.php ]]; then
     cp web/sites/default/default.settings.php web/sites/default/settings.php
     chmod 666 web/sites/default/settings.php
     echo "settings.php criado a partir do default."
   fi
   ```

6. Preparar estrutura para stack Docker:
   ```bash
   mkdir -p /workspace/.piclaw/stack
   # Copiar templates se disponíveis
   if [[ -d /home/agent/.pi/templates ]]; then
     cp /home/agent/.pi/templates/Dockerfile.php /workspace/.piclaw/stack/ 2>/dev/null || true
     cp /home/agent/.pi/templates/nginx.conf /workspace/.piclaw/stack/ 2>/dev/null || true
   fi
   echo "📦 Estrutura stack Docker preparada em .piclaw/stack/"
   ```

7. Reportar resultado:
   ```bash
   echo "✅ Projecto Drupal criado."
   echo ""
   echo "Próximos passos:"
   echo "  1. Usa 'drupal-serve' para iniciar a stack (escolhe BD)"
   echo "     Opções: mariadb | postgres | sqlite"
   echo "  2. Depois de iniciada, acede via browser na porta indicada"
   echo "  3. Completa instalação Drupal via browser ou:"
   echo "     vendor/bin/drush site:install --db-url=mysql://drupal:drupal@db/drupal"
   echo ""
   echo "Comandos de stack:"
   echo "  drupal-serve          — inicia containers (PHP + nginx + BD)"
   echo "  drupal-stack stop     — para containers"
   echo "  drupal-stack status   — estado actual"
   ```
