---
name: drupal-watchdog-cache
description: Actualiza silenciosamente a cache JSON do painel Watchdog da UI. Responde apenas com uma linha de confirmação sem mostrar os logs completos.
distribution: public
---

# drupal-watchdog-cache

Uso interno da UI do DrupalClaw. Escreve `/workspace/.piclaw/watchdog.json` com os últimos 60 registos do watchdog Drupal em formato JSON compacto. Não imprime os logs — responde apenas com o resultado da operação numa única linha curta.

## Steps

1. Detectar Drush e escrever cache JSON:
   ```bash
   PHP_CONTAINER=$(docker ps --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -E "drupal.*(php|fpm)" | head -1)
   if [[ -n "$PHP_CONTAINER" ]]; then
     DRUSH="docker exec -i -w /var/www/html $PHP_CONTAINER vendor/bin/drush"
   elif [[ -x "vendor/bin/drush" ]]; then
     DRUSH="vendor/bin/drush"
   else
     echo "ERROR: stack not running"
     exit 1
   fi

   CACHE_DIR="/workspace/.piclaw"
   mkdir -p "$CACHE_DIR"
   # Use 60 entries and compact JSON to stay within PiClaw's 20KB file API limit
   WATCHDOG_JSON=$($DRUSH watchdog:show --count=60 --format=json 2>/dev/null)
   if [[ -n "$WATCHDOG_JSON" && "$WATCHDOG_JSON" != "null" ]]; then
     # Compact JSON (remove whitespace) to minimise file size
     COMPACT=$(echo "$WATCHDOG_JSON" | python3 -c "import sys,json; sys.stdout.write(json.dumps(json.loads(sys.stdin.read())))" 2>/dev/null || echo "$WATCHDOG_JSON")
     printf '%s' "$COMPACT" > "$CACHE_DIR/watchdog.json"
     echo "Cache actualizada."
   else
     printf '{}' > "$CACHE_DIR/watchdog.json"
     echo "Cache vazia (sem registos no watchdog)."
   fi
   ```
