# DrupalClaw

A self-hosted, agent-first Drupal development workspace. Runs entirely in Docker and provides a browser-based IDE with chat, terminal, editor, file browser, and Drupal-specific panels — all powered by an AI agent with support for multiple LLM providers (GitHub Copilot, Anthropic Claude, OpenAI, and others).

## What it is

DrupalClaw wraps [PiClaw](https://github.com/rcarmo/piclaw) (a Bun/TypeScript AI agent backend) with a custom React frontend and a Drupal-specific toolset:

- **Chat** — talk to the agent to scaffold modules, debug issues, run Drush commands, manage the Docker stack
- **Terminal** — full PTY terminal inside the browser
- **Editor** — Monaco-based code editor with file browser
- **Dev Panel** — one-click Drupal commands (cache rebuild, status, module install, DB export/import, logs, analysis)
- **Flows** — automated multi-step workflows triggered manually or on a schedule
- **MCP support** — connect external tools (GitHub, Jira, etc.) via the Model Context Protocol

The AI agent knows Drupal: it reads SKILL.md files for 15+ Drupal-specific operations and executes them step by step, including orchestrating Docker containers for the PHP-FPM + nginx + database dev stack.

## Architecture

```
Browser
  └── React 18 frontend (Vite + Tailwind + Zustand + Monaco + xterm.js)
        └── PiClaw backend (Bun — chat engine, SSE, WebSocket PTY, keychain)
              └── Docker host socket (sibling containers)
                    ├── PHP-FPM 8.3 + nginx (Drupal execution)
                    └── MariaDB / PostgreSQL / SQLite
```

- **Frontend** (`frontend/`) — custom React app served as static files by PiClaw
- **Backend** (`backend/config/`) — system prompt + dev panel config overlaid on PiClaw
- **Skills** (`skills/`) — 15 Drupal-specific agent skills (SKILL.md format)
- **Workspace** (`workspace/`) — mounted as `/workspace` inside the container; Drupal project lives at `/workspace/drupal`
- **Config** (`config/`) — PiClaw agent config, templates, assets (mounted as `/config`)

## Requirements

- Docker + Docker Compose
- ~4 GB disk (base image + PHP extensions + Drupal project)
- An LLM provider API key or OAuth access (GitHub Copilot, Anthropic, OpenAI, etc.)

## Installation

### 1. Clone

```bash
git clone https://github.com/PauloCarv/drupalclaw-project.git
cd drupalclaw-project
```

### 2. Build and start

```bash
cd docker
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
```

> `DOCKER_BUILDKIT=0` is required — the Dockerfile uses the classic builder.

### 3. Open in browser

```
http://localhost:8090
```

On first launch you'll be guided through the provider setup (OOBE): pick your LLM provider and authenticate via OAuth or API key.

### 4. Create your Drupal project

Once the workspace is open, use the chat:

```
drupal-serve
```

This starts the Docker stack (PHP-FPM + nginx + database). Then:

```
drupal-init
```

The agent will ask whether to create a new project via Composer or clone an existing Git repository, and whether to import a database dump or files archive.

## Configuration

### LLM provider

Configured via the OOBE wizard on first launch, or via `/login` in the chat at any time.

### Docker stack port

The UI runs on port `8090` by default. To change it, edit `docker/docker-compose.yml`:

```yaml
ports:
  - "8090:8090"
```

### Database

When running `drupal-serve`, the agent asks which database to use:
- **MariaDB** (recommended, MySQL-compatible)
- **PostgreSQL**
- **SQLite** (no extra container, file-based)

### MCP servers

MCP servers can be configured via chat (the agent writes `/workspace/.pi/mcp.json`) or directly by editing that file. After saving, send `/restart` in the chat to activate.

Example to add the GitHub MCP server:
```
Add a GitHub MCP server with my token ghp_...
```

## Development

To rebuild only the frontend after changes:

```bash
cd frontend
npm install
npm run build
docker cp dist/. docker-drupalclaw-1:/usr/local/lib/bun/install/global/node_modules/piclaw/runtime/web/static/drupalclaw/
```

To run the frontend dev server with hot reload (proxies API to the container):

```bash
cd frontend
npm run dev
# open http://localhost:5173
```

## Drupal skills

| Command | Description |
|---|---|
| `drupal-serve` | Start Docker stack (PHP-FPM + nginx + DB) |
| `drupal-stack [action]` | Stack lifecycle: start / stop / restart / destroy |
| `drupal-init` | Create or clone a Drupal project |
| `drupal-cr` | Cache rebuild (drush cr) |
| `drupal-status` | Full Drupal status report |
| `drupal-module [name]` | Scaffold a custom module |
| `drupal-install [module]` | Install a contrib module via Composer + Drush |
| `drupal-analyze` | PHPStan + PHPCS analysis |
| `drupal-fix` | Auto-fix code style (PHPCBF) |
| `drupal-db-export` | Export database to SQL dump |
| `drupal-db-import [file]` | Import SQL dump |
| `drupal-db-query [sql]` | Run SQL query via Drush |
| `drupal-logs` | Recent watchdog + container logs |
| `drupal-debug` | Full diagnostic report |
| `drupal-perf` | Performance analysis |

## License

MIT
