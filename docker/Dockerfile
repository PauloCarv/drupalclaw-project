# DrupalClaw Workspace — Multi-stage build
# Stage 1: Build React frontend
# Stage 2: PiClaw base + PHP stack + overlay + React UI

# -----------------------------------------------------------------------------
# Stage 1: Build the React frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Final runtime image — based on working PiClaw
# -----------------------------------------------------------------------------
FROM ghcr.io/rcarmo/piclaw:latest

ARG PICLAW_DIR=/usr/local/lib/bun/install/global/node_modules/piclaw

# -- Install PHP 8.3 + Drupal dev stack + Docker CLI --
RUN apt-get update && apt-get install -y --no-install-recommends \
    php-cli php-mbstring php-curl \
    php-xml php-sqlite3 php-mysql \
    php-gd php-zip php-opcache \
    php-apcu php-intl \
    php-bcmath php-soap \
    sqlite3 default-mysql-client unzip patch \
    ca-certificates curl gnupg && \
    # Docker CLI (no daemon — uses host socket)
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/* && \
    # Composer
    php -r "copy('https://getcomposer.org/installer', '/tmp/composer-setup.php');" && \
    php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer && \
    rm /tmp/composer-setup.php && \
    # Drush launcher (global)
    composer global require drush/drush --no-interaction --prefer-dist 2>/dev/null || true && \
    # Verify installations
    php --version && composer --version && docker --version

# -- Skip overlay and re-bundle for now — use PiClaw UI as-is --
# The React frontend will be served separately; overlays need version-pinning to work.

WORKDIR ${PICLAW_DIR}

# -- Copy React frontend build into PiClaw static serving --
COPY --from=frontend-build /app/dist/ ${PICLAW_DIR}/runtime/web/static/drupalclaw/

# -- Replace PiClaw index.html with redirect to DrupalClaw UI --
RUN echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/static/drupalclaw/index.html"></head><body></body></html>' \
    > ${PICLAW_DIR}/runtime/web/static/index.html

# -- Copy Drupal skills --
COPY skills/ /home/agent/.pi/skills/
RUN mkdir -p /workspace/.pi/skills
COPY skills/ /workspace/.pi/skills/

# -- Copy stack templates --
COPY templates/ /home/agent/.pi/templates/

# -- Copy config (stored outside /workspace volume so entrypoint can always apply) --
RUN mkdir -p /home/agent/.pi/agent
COPY backend/config/dev-panel.json /home/agent/.pi/agent/dev-panel.json
COPY backend/config/AGENTS.md /home/agent/.pi/agent/AGENTS.md

# -- Copy branding assets (pre-resize to 64x64 to avoid env size limits) --
RUN mkdir -p /home/agent/.pi/assets
COPY frontend/public/icon.png /tmp/drupal_claw_icon_full.png
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick && \
    convert /tmp/drupal_claw_icon_full.png -resize 64x64 /home/agent/.pi/assets/drupal_claw_icon.png && \
    rm /tmp/drupal_claw_icon_full.png && \
    apt-get purge -y imagemagick && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# -- Entrypoint wrapper --
RUN mv /entrypoint.sh /entrypoint-piclaw.sh 2>/dev/null || true
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
