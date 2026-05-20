---
name: drupal-serve
description: Inicia a stack Drupal (nginx + PHP-FPM + BD) via Docker containers. Substitui o php -S embutido.
distribution: public
---

# drupal-serve

Inicia a stack de desenvolvimento Drupal usando containers Docker (nginx + PHP-FPM + BD).

## Parâmetros

- `db` — mariadb | postgres | sqlite (default: pergunta ao utilizador se não configurado)
- `port` — porta para aceder ao Drupal (default: auto-detect a partir de 8085)

## Steps

### 1. Verificar se existe projecto Drupal (aviso suave)

```bash
WORKSPACE_DIR="/workspace"
DRUPAL_DIR="${WORKSPACE_DIR}/drupal"
if [[ ! -d "$DRUPAL_DIR" ]]; then
  DRUPAL_DIR="$WORKSPACE_DIR"
fi

DRUPAL_EXISTS=false
if [[ -f "${DRUPAL_DIR}/composer.json" ]] && grep -q "drupal/core" "${DRUPAL_DIR}/composer.json"; then
  DRUPAL_EXISTS=true
  echo "✅ Projecto Drupal encontrado: $DRUPAL_DIR"
else
  echo "ℹ️  Nenhum projecto Drupal encontrado — a stack vai arrancar na mesma."
  echo "   Após a stack iniciar, usa 'drupal-init' para criar o projecto Drupal."
  echo ""
fi
```

### 2. Verificar Docker socket

```bash
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker socket não disponível."
  echo ""
  echo "O container PiClaw precisa de ser iniciado com:"
  echo "  -v /var/run/docker.sock:/var/run/docker.sock"
  echo ""
  echo "Alternativa rápida (php built-in server, sem BD):"
  echo "  cd ${DRUPAL_DIR}/web && php -S 0.0.0.0:8888 .ht.router.php"
  exit 1
fi
```

### 3. Verificar se stack já está a correr

```bash
STATE_FILE="${WORKSPACE_DIR}/.piclaw/stack/state.json"
if [[ -f "$STATE_FILE" ]]; then
  EXISTING_URL=$(jq -r '.drupal_url // empty' "$STATE_FILE" 2>/dev/null)
  if [[ -n "$EXISTING_URL" ]] && docker compose -f "${WORKSPACE_DIR}/docker-compose.drupal.yml" -p drupal-dev ps --status running 2>/dev/null | grep -q "php"; then
    echo "✅ Stack já está a correr!"
    echo "  🌐 $EXISTING_URL"
    echo ""
    echo "Para reiniciar: drupal-stack restart"
    echo "Para parar: drupal-stack stop"
    exit 0
  fi
fi
```

### 4. Perguntar BD ao utilizador (se não especificado)

Se o parâmetro `db` não foi fornecido, perguntar:

> Que base de dados queres usar?
> 1. **MariaDB** (recomendado, compatível MySQL)
> 2. **PostgreSQL** (suporte nativo Drupal)
> 3. **SQLite** (sem container extra, ficheiro local)

### 5. Iniciar stack via drupal-stack

```bash
# DB_TYPE vem do parâmetro ou da escolha do utilizador
DB_TYPE="${DB_TYPE:-mariadb}"
export DB_TYPE

# Executar skill drupal-stack
# (o agente chama internamente drupal-stack com action=start)
echo "🚀 A iniciar stack Drupal com $DB_TYPE..."
```

Executar a skill `drupal-stack` com `action=start` e `db=$DB_TYPE`.

### 6. Mostrar resultado

```bash
STATE_FILE="${WORKSPACE_DIR}/.piclaw/stack/state.json"
if [[ -f "$STATE_FILE" ]]; then
  URL=$(jq -r '.drupal_url' "$STATE_FILE")
  DB=$(jq -r '.db_type' "$STATE_FILE")
  echo ""
  echo "═══════════════════════════════════════════════"
  if [[ "$DRUPAL_EXISTS" == "true" ]]; then
    echo "✅ Stack Drupal a correr!"
    echo "  🌐 Site: $URL"
  else
    echo "✅ Stack a correr! Próximo passo: criar o projecto Drupal."
    echo "  🗄️  Base de dados disponível em: $URL"
  fi
  echo "  🗄️  BD: $DB"
  echo "═══════════════════════════════════════════════"
  echo ""
  if [[ "$DRUPAL_EXISTS" == "false" ]]; then
    echo "👉 Próximo passo: usa 'drupal-init' para criar o projecto Drupal."
    echo "   A base de dados já está pronta e será usada automaticamente."
    echo ""
  fi
  echo "Comandos úteis:"
  echo "  drupal-stack stop     — parar stack"
  echo "  drupal-stack restart  — reiniciar"
  echo "  drupal-stack status   — ver estado"
  echo "  drupal-stack destroy  — remover tudo (incl. dados BD)"
fi
```
