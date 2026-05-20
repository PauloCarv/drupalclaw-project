---
name: drupal-init
description: Inicializa um projecto Drupal em /workspace/drupal — novo via Composer ou existente via Git.
distribution: public
---

# drupal-init

Inicializa o projecto Drupal em `/workspace/drupal`. Suporta três cenários:
- Projecto novo via Composer (drupal/recommended-project)
- Repositório Git existente (clone de URL)
- Pasta já existente (avisa e pergunta antes de sobrescrever)

---

## Step 1 — Verificar se já existe projecto

```bash
DRUPAL_DIR="/workspace/drupal"

if [[ -f "${DRUPAL_DIR}/composer.json" ]] && grep -q "drupal/core" "${DRUPAL_DIR}/composer.json"; then
  PROJECT_NAME=$(jq -r '.name // "sem nome"' "${DRUPAL_DIR}/composer.json" 2>/dev/null || echo "desconhecido")
  echo "⚠️  Já existe um projecto Drupal em $DRUPAL_DIR"
  echo "   Nome: $PROJECT_NAME"
  echo ""
  echo "❌ ATENÇÃO: Continuar vai APAGAR todos os ficheiros e a base de dados!"
  echo "PROJECT_EXISTS=true"
  echo "PROJECT_NAME=$PROJECT_NAME"
elif [[ -d "${DRUPAL_DIR}" ]] && [[ "$(ls -A ${DRUPAL_DIR} 2>/dev/null | grep -v '^\.gitkeep$')" != "" ]]; then
  echo "⚠️  A pasta $DRUPAL_DIR existe mas não parece um projecto Drupal válido."
  echo "PROJECT_EXISTS=partial"
else
  echo "PROJECT_EXISTS=false"
fi
```

**Se PROJECT_EXISTS=true ou partial**, perguntar ao utilizador antes de continuar:

> Já existe conteúdo em `/workspace/drupal` (`$PROJECT_NAME`).
> Queres **apagar tudo e começar do zero**?
> - `sim` — apaga o directório e continua
> - `não` — cancela (padrão)

Se o utilizador responder `sim`:
```bash
# Parar stack se estiver a correr
if [[ -f "/workspace/docker-compose.drupal.yml" ]]; then
  docker compose -f /workspace/docker-compose.drupal.yml -p drupal-dev down -v 2>/dev/null || true
  echo "⏹️  Stack parada e volumes removidos."
fi
rm -rf "$DRUPAL_DIR"
mkdir -p "$DRUPAL_DIR"
echo "🗑️  Directório $DRUPAL_DIR limpo."
```

Se o utilizador responder `não` (padrão):
```bash
echo "ℹ️  Operação cancelada. Projecto existente preservado."
echo "   Usa 'drupal-serve' para iniciar a stack se ainda não estiver a correr."
exit 0
```

**Se PROJECT_EXISTS=false**, continuar directamente para o Step 2 sem perguntar.

---

## Step 2 — Tipo de projecto

Perguntar ao utilizador:

> Como queres inicializar o projecto Drupal?
>
> 1. **Novo projecto** — instalar Drupal de raiz via Composer
> 2. **Repositório Git existente** — clonar de URL (GitHub, GitLab, Bitbucket, etc.)

Guardar a escolha como `INIT_TYPE=new` ou `INIT_TYPE=git`.

---

## Step 3a — Se INIT_TYPE=git: clonar repositório

Perguntar ao utilizador:

> Qual é o URL do repositório Git?
> (ex: `https://github.com/utilizador/meu-drupal.git` ou `git@github.com:utilizador/meu-drupal.git`)

```bash
# GIT_URL vem da resposta do utilizador
GIT_URL="<URL fornecido>"

echo "🔄 A clonar repositório..."
git clone "$GIT_URL" /workspace/drupal
cd /workspace/drupal

# Instalar dependências se composer.json existir
if [[ -f "composer.json" ]]; then
  echo "📦 A instalar dependências Composer..."
  composer install --no-interaction
fi

echo "✅ Repositório clonado com sucesso."
echo "INIT_DONE=true"
echo "NEEDS_COMPOSER=false"
```

Após clone, avançar para o **Step 4** (importação de dados).

---

## Step 3b — Se INIT_TYPE=new: criar projecto via Composer

```bash
mkdir -p /workspace/drupal
cd /workspace/drupal
echo "📦 A criar projecto Drupal via Composer (pode demorar alguns minutos)..."
composer create-project drupal/recommended-project . --no-interaction
```

```bash
cd /workspace/drupal
echo "🔧 A instalar Drush..."
composer require drush/drush --no-interaction
```

```bash
cd /workspace/drupal
echo "📦 A instalar módulos contrib essenciais..."
composer require drupal/admin_toolbar drupal/pathauto drupal/token drupal/metatag --no-interaction
```

```bash
cd /workspace/drupal
if [[ -f web/sites/default/default.settings.php ]]; then
  cp web/sites/default/default.settings.php web/sites/default/settings.php
  chmod 666 web/sites/default/settings.php
  echo "✅ settings.php criado."
fi
echo "INIT_DONE=true"
echo "NEEDS_COMPOSER=false"
```

---

## Step 4 — Importação de base de dados (opcional)

Perguntar ao utilizador:

> Tens um dump SQL para importar?
> - `sim` — indica o caminho do ficheiro (ex: `/workspace/backup.sql` ou `/workspace/backup.sql.gz`)
> - `não` — continuar sem importar

**Se sim**, perguntar o caminho e executar:

```bash
# SQL_FILE vem da resposta do utilizador
SQL_FILE="<caminho fornecido>"

# Verificar se stack está a correr para importar via container
STACK_RUNNING=false
if docker compose -f "/workspace/docker-compose.drupal.yml" -p drupal-dev ps --status running 2>/dev/null | grep -q "db"; then
  STACK_RUNNING=true
fi

if [[ "$STACK_RUNNING" == "true" ]]; then
  echo "📥 A importar dump SQL via stack Docker..."
  if [[ "$SQL_FILE" == *.gz ]]; then
    gunzip -c "$SQL_FILE" | docker compose -f /workspace/docker-compose.drupal.yml -p drupal-dev exec -T db mysql -udrupal -pdrupal drupal
  else
    docker compose -f /workspace/docker-compose.drupal.yml -p drupal-dev exec -T db mysql -udrupal -pdrupal drupal < "$SQL_FILE"
  fi
  echo "✅ Base de dados importada."
else
  echo "⚠️  Stack não está a correr — a importação SQL não pode ser feita agora."
  echo "   Inicia a stack com 'drupal-serve' e depois importa com 'drupal-db-import $SQL_FILE'."
fi
```

**Se não**, continuar.

---

## Step 5 — Importação de ficheiros sites/default/files (opcional)

Perguntar ao utilizador:

> Tens ficheiros de media/uploads para importar? (zip ou tar.gz de `sites/default/files`)
> - `sim` — indica o caminho do arquivo
> - `não` — continuar

**Se sim**, perguntar o caminho e executar:

```bash
# ARCHIVE_FILE vem da resposta do utilizador
ARCHIVE_FILE="<caminho fornecido>"
FILES_DIR="/workspace/drupal/web/sites/default/files"

mkdir -p "$FILES_DIR"

echo "📂 A extrair ficheiros para $FILES_DIR..."
if [[ "$ARCHIVE_FILE" == *.tar.gz ]] || [[ "$ARCHIVE_FILE" == *.tgz ]]; then
  tar -xzf "$ARCHIVE_FILE" -C "$FILES_DIR" --strip-components=1 2>/dev/null || tar -xzf "$ARCHIVE_FILE" -C "$FILES_DIR"
elif [[ "$ARCHIVE_FILE" == *.zip ]]; then
  unzip -o "$ARCHIVE_FILE" -d "$FILES_DIR"
else
  echo "⚠️  Formato não reconhecido. Suportados: .zip, .tar.gz, .tgz"
fi

# Corrigir permissões
chmod -R 755 "$FILES_DIR"
echo "✅ Ficheiros extraídos para $FILES_DIR"
```

**Se não**, continuar.

---

## Step 6 — Preparar estrutura Docker

```bash
mkdir -p /workspace/.piclaw/stack
if [[ -d /home/agent/.pi/templates ]]; then
  cp /home/agent/.pi/templates/Dockerfile.php /workspace/.piclaw/stack/ 2>/dev/null || true
  cp /home/agent/.pi/templates/nginx.conf /workspace/.piclaw/stack/ 2>/dev/null || true
fi
echo "📦 Estrutura stack Docker preparada em .piclaw/stack/"
```

---

## Step 7 — Verificar stack e reportar resultado

```bash
echo ""
echo "✅ Projecto Drupal inicializado em /workspace/drupal"
echo ""

# Verificar se stack está a correr
STACK_RUNNING=false
STATE_FILE="/workspace/.piclaw/stack/state.json"
if [[ -f "$STATE_FILE" ]] && docker compose -f "/workspace/docker-compose.drupal.yml" -p drupal-dev ps --status running 2>/dev/null | grep -q "php"; then
  STACK_RUNNING=true
  STACK_URL=$(jq -r '.drupal_url // ""' "$STATE_FILE" 2>/dev/null)
fi

if [[ "$STACK_RUNNING" == "true" ]]; then
  echo "═══════════════════════════════════════════════"
  echo "✅ Stack já está a correr!"
  echo "   Completa a instalação Drupal via browser:"
  echo "   🌐 $STACK_URL"
  echo ""
  echo "   Ou instala via drush (se não importaste BD):"
  echo "   vendor/bin/drush site:install --db-url=mysql://drupal:drupal@db/drupal -y"
  echo "═══════════════════════════════════════════════"
else
  echo "═══════════════════════════════════════════════"
  echo "👉 Próximo passo: inicia a stack Docker"
  echo "   Usa 'drupal-serve' para iniciar os containers (PHP + nginx + BD)."
  echo "   Opções de BD: mariadb (recomendado) | postgres | sqlite"
  echo ""
  echo "   Após a stack iniciar, completa a instalação via browser"
  echo "   ou com: vendor/bin/drush site:install -y"
  echo "═══════════════════════════════════════════════"
fi
```
