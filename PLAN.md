# DrupalClaw Workspace — Architecture Plan

## Vision

A self-hosted, agent-first Drupal development workspace with a modern, Drupal-branded UI. The developer opens a browser, sees a professional IDE-like interface with chat, terminal, editor, file browser, and Drupal-specific panels — all powered by an AI agent that can be configured to use any LLM provider.

**Tagline:** "Your AI-Powered Drupal IDE"

---

## Strategy: Fork PiClaw + Custom React UI

### Why fork instead of building from scratch

| Aspect | Fork PiClaw | Build from scratch |
|--------|-------------|-------------------|
| Chat engine (streaming, SSE) | ✅ Ready | 2-3 weeks |
| Memory/context (SQLite) | ✅ Ready | 2-3 weeks |
| AI provider abstraction | ✅ Ready | 1-2 weeks |
| Tool/skill system | ✅ Ready | 2-3 weeks |
| Keychain (encrypted) | ✅ Ready | 1 week |
| Session management | ✅ Ready | 1-2 weeks |
| Terminal integration | ✅ Ready | 1-2 weeks |
| **Total backend effort** | **~0 weeks** | **~12-16 weeks** |

### What we keep from PiClaw (backend)

- **Chat engine**: `/agent/default/message` API, SSE streaming, conversation history
- **Memory system**: "Dream" memory, SQLite persistence (`messages.db`)
- **Provider abstraction**: OpenAI, Anthropic, Ollama, Azure, Gemini — with encrypted keychain
- **Tool system**: `list_tools`, `list_scripts`, staged discovery, bash execution
- **Skill loader**: `.pi/skills/<name>/SKILL.md` convention
- **Session management**: Multiple chat sessions, history navigation
- **File operations**: Read/write/watch workspace files
- **Terminal backend**: PTY management, resize events

### What we replace (frontend)

The entire PiClaw web frontend (`runtime/web/`) gets replaced by a new React application. PiClaw's current UI uses Preact + htm with a pane system. We replace it with:

- **React 18** + **TypeScript** — for the component framework
- **Tailwind CSS** — for styling (utility-first, fast iteration)
- **shadcn/ui** — for base components (tabs, dialogs, dropdowns, buttons)
- **Monaco Editor** — for the code editor (same engine as VS Code)
- **xterm.js** — for the terminal emulator
- **React Query** — for server state management (chat, files, etc.)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                Docker Container                  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         PiClaw Backend (Bun/TS)          │   │
│  │                                           │   │
│  │  Chat Engine ← SSE → React Frontend      │   │
│  │  Memory (SQLite)                          │   │
│  │  Provider Abstraction (LLM APIs)          │   │
│  │  Tool System (bash, files, skills)        │   │
│  │  Keychain (encrypted credentials)         │   │
│  │  Terminal PTY Manager                     │   │
│  └──────┬───────────────────────────┬───────┘   │
│         │ HTTP/SSE API              │ PTY        │
│  ┌──────▼───────────────────────────▼───────┐   │
│  │        React Frontend (New)               │   │
│  │                                           │   │
│  │  ┌─── Sidebar ──┐  ┌─── Main Area ──┐   │   │
│  │  │ Chat history  │  │ Tab system:     │   │   │
│  │  │ File browser  │  │  - Chat         │   │   │
│  │  │ Skills panel  │  │  - Editor       │   │   │
│  │  │ Settings      │  │  - Terminal     │   │   │
│  │  └──────────────┘  │  - Dev Panel    │   │   │
│  │                     │  - Logs         │   │   │
│  │                     └────────────────┘   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  PHP 8.3 + Composer + Drush + Docker CLI         │
│  (Drupal development tools — same as now)        │
└─────────────────────────────────────────────────┘
```

---

## UI Layout Design

### Main Layout (3-column with collapsible sidebar)

```
┌────────────────────────────────────────────────────────┐
│  🔷 DrupalClaw    [provider: ollama ▼]    ⚙️  👤  🌙  │  ← Top bar
├──────────┬─────────────────────────────────────────────┤
│          │  [Chat] [Terminal] [Editor] [Dev Panel] [+] │  ← Tab strip
│ Sidebar  ├─────────────────────────────────────────────┤
│          │                                             │
│ 💬 Chats │              Active Tab                     │
│ 📁 Files │              Content Area                   │
│ ⚡ Skills│                                             │
│ 🔧 Tools │              (chat / editor / terminal      │
│ ⚙️ Config│               / dev panel / logs)           │
│          │                                             │
│          ├─────────────────────────────────────────────┤
│          │  Bottom Panel (collapsible)                  │
│          │  [Terminal] [Logs] [Output]                  │
└──────────┴─────────────────────────────────────────────┘
```

### Key UI Differences from PiClaw

1. **Collapsible left sidebar** with navigation (Chats, Files, Skills, Config)
2. **Tab system** in the main area (like VS Code) — not the current pane/popout model
3. **Bottom panel** for terminal/logs (like VS Code's panel)
4. **Drupal branding** — navy/blue/teal colour palette, Drupal iconography
5. **Provider selector** visible in the top bar — easy switching
6. **Responsive** — works on tablets too (sidebar collapses to icons)

---

## MVP Scope (Phase 1)

### Must-have features

1. **Chat Panel**
   - Streaming AI responses (SSE from PiClaw backend)
   - Markdown rendering with code syntax highlighting
   - Multi-session support (new chat, switch, history)
   - Adaptive Cards rendering (structured responses)
   - File attachments (drag & drop)

2. **Terminal Panel**
   - Full terminal emulator (xterm.js)
   - Multiple terminal tabs
   - Resize support
   - Copy/paste

3. **Editor Panel**
   - Monaco Editor (TypeScript, PHP, YAML, JSON, Twig syntax)
   - File open/save via workspace API
   - Multi-tab editing
   - Syntax highlighting for Drupal-specific files (.module, .install, .theme)

4. **Dev Panel (Drupal-specific)**
   - Same concept as current DrupalClaw dev panel
   - Configurable via `dev-panel.json`
   - Grouped buttons that send commands to chat
   - Drupal stack management (start/stop/restart/status)

5. **File Browser (sidebar)**
   - Workspace file tree
   - Open in editor
   - Create/rename/delete files
   - Context menu

6. **Skills Panel (sidebar)**
   - List available skills from `.pi/skills/`
   - Click to see description
   - Click to execute (sends command to chat)

7. **Settings**
   - AI provider selection and configuration
   - Theme toggle (light/dark)
   - Workspace path configuration

### Nice-to-have (Phase 2)

- Watchdog Logs viewer (real-time tail of Drupal logs)
- Database browser (tables, queries)
- Drupal config inspector
- Performance profiler panel
- Git integration panel
- Docker container status panel
- Visual flow/architecture diagrams
- Collaborative features (shared sessions)

---

## File Structure

```
drupalclaw-workspace/
├── PLAN.md                          # This file
├── docker/
│   ├── Dockerfile                   # Multi-stage: PiClaw base + PHP + React UI
│   ├── docker-compose.yml           # Dev environment
│   └── entrypoint.sh                # Startup script
├── backend/
│   ├── patches/                     # Patches to PiClaw backend (minimal)
│   └── config/
│       ├── AGENTS.md                # Agent instructions (Drupal-specific)
│       └── providers.json           # Default provider config
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── vite.config.ts               # Vite for dev + build
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                 # Entry point
│   │   ├── App.tsx                  # Root layout
│   │   ├── api/
│   │   │   ├── client.ts            # HTTP client for PiClaw API
│   │   │   ├── chat.ts              # Chat API (send message, stream SSE)
│   │   │   ├── files.ts             # File operations API
│   │   │   ├── terminal.ts          # Terminal WebSocket API
│   │   │   └── providers.ts         # AI provider management API
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui base components
│   │   │   ├── layout/
│   │   │   │   ├── TopBar.tsx       # Logo, provider selector, settings
│   │   │   │   ├── Sidebar.tsx      # Collapsible sidebar with sections
│   │   │   │   ├── TabStrip.tsx     # Main area tab management
│   │   │   │   ├── BottomPanel.tsx  # Collapsible bottom panel
│   │   │   │   └── MainLayout.tsx   # 3-column layout orchestrator
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx    # Chat container
│   │   │   │   ├── MessageList.tsx  # Message rendering
│   │   │   │   ├── MessageBubble.tsx# Single message (markdown + cards)
│   │   │   │   ├── ChatInput.tsx    # Input with file drop
│   │   │   │   └── SessionList.tsx  # Chat history sidebar
│   │   │   ├── editor/
│   │   │   │   ├── EditorPanel.tsx  # Monaco wrapper
│   │   │   │   └── EditorTabs.tsx   # Multi-file tabs
│   │   │   ├── terminal/
│   │   │   │   ├── TerminalPanel.tsx# xterm.js wrapper
│   │   │   │   └── TerminalTabs.tsx # Multi-terminal tabs
│   │   │   ├── devpanel/
│   │   │   │   ├── DevPanel.tsx     # Drupal dev panel
│   │   │   │   └── SkillButton.tsx  # Individual skill button
│   │   │   ├── files/
│   │   │   │   ├── FileTree.tsx     # File browser tree
│   │   │   │   └── FileActions.tsx  # Context menu actions
│   │   │   └── skills/
│   │   │       ├── SkillsList.tsx   # Skills browser
│   │   │       └── SkillCard.tsx    # Skill detail card
│   │   ├── hooks/
│   │   │   ├── useChat.ts          # Chat state + SSE streaming
│   │   │   ├── useTerminal.ts      # Terminal connection
│   │   │   ├── useFiles.ts         # File tree state
│   │   │   ├── useProviders.ts     # Provider management
│   │   │   └── useTheme.ts         # Theme state (light/dark/drupal)
│   │   ├── stores/
│   │   │   ├── chatStore.ts        # Zustand store for chat state
│   │   │   ├── layoutStore.ts      # Panel visibility, sizes
│   │   │   └── settingsStore.ts    # User preferences
│   │   ├── themes/
│   │   │   ├── drupal-light.css    # Drupal light theme variables
│   │   │   ├── drupal-dark.css     # Drupal dark theme variables
│   │   │   └── tokens.ts           # Design tokens
│   │   └── lib/
│   │       ├── markdown.ts         # Markdown → React renderer
│   │       ├── adaptive-cards.ts   # Adaptive Cards → React
│   │       └── syntax.ts           # Custom syntax definitions
│   └── public/
│       ├── logo.png
│       └── icon.png
├── skills/                          # Drupal skills (same as current)
│   ├── drupal-init/SKILL.md
│   ├── drupal-serve/SKILL.md
│   ├── drupal-stack/SKILL.md
│   ├── drupal-cr/SKILL.md
│   ├── drupal-status/SKILL.md
│   ├── drupal-module/SKILL.md
│   ├── drupal-analyze/SKILL.md
│   ├── drupal-fix/SKILL.md
│   ├── drupal-install/SKILL.md
│   ├── drupal-db-export/SKILL.md
│   ├── drupal-db-import/SKILL.md
│   ├── drupal-db-query/SKILL.md
│   ├── drupal-logs/SKILL.md
│   ├── drupal-debug/SKILL.md
│   └── drupal-perf/SKILL.md
└── templates/                       # Docker compose templates
    ├── mariadb.yml
    ├── postgres.yml
    └── sqlite.yml
```

---

## Technology Decisions

### Frontend Stack

| Tech | Version | Purpose |
|------|---------|---------|
| React | 18.3+ | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Dev server + bundler |
| Tailwind CSS | 3.x | Styling |
| shadcn/ui | latest | Base component library |
| Monaco Editor | 0.45+ | Code editor (VS Code engine) |
| xterm.js | 5.x | Terminal emulator |
| Zustand | 4.x | State management (lightweight) |
| React Query | 5.x | Server state / caching |
| Lucide React | latest | Icons |

### Backend (PiClaw — kept as-is)

| Tech | Purpose |
|------|---------|
| Bun | Runtime (fast TS execution) |
| SQLite | Chat history, memory, tasks |
| SSE | Real-time streaming |
| WebSocket | Terminal PTY |

### Docker

| Layer | Purpose |
|-------|---------|
| PiClaw base image | Chat engine + tools + Bun |
| PHP 8.3 + extensions | Drupal development |
| Composer + Drush | Dependency management |
| Docker CLI | Sibling containers (nginx, DB) |
| React build output | Static files served by PiClaw |

---

## API Integration Points

The React frontend communicates with PiClaw backend via these APIs:

### Chat API
```
POST /agent/default/message      # Send message (returns SSE stream)
GET  /agent/default/messages     # Get chat history
GET  /agent/default/sessions     # List sessions
POST /agent/default/sessions     # Create new session
```

### File API
```
GET  /workspace/tree             # File tree
GET  /workspace/file?path=...    # Read file
PUT  /workspace/file?path=...    # Write file
DELETE /workspace/file?path=...  # Delete file
```

### Terminal API
```
WebSocket /terminal/default      # PTY connection
POST /terminal/resize            # Resize terminal
```

### Provider API
```
GET  /providers                  # List configured providers
POST /providers                  # Add/update provider
GET  /providers/models           # List available models
```

### Skills API
```
GET  /skills                     # List available skills
GET  /skills/:name               # Get skill details
```

> Note: These are approximate — the exact PiClaw API endpoints will need to be confirmed by reading the source. The fork allows us to add new endpoints if needed.

---

## Development Phases

### Phase 1 — MVP (4-6 weeks)

**Week 1-2: Foundation**
- [ ] Fork PiClaw repository
- [ ] Set up React + Vite + Tailwind project in `frontend/`
- [ ] Create MainLayout with collapsible sidebar, tab strip, bottom panel
- [ ] Implement Drupal theme (light + dark)
- [ ] Build TopBar with logo and provider selector
- [ ] Connect to PiClaw chat API — send/receive messages with SSE streaming

**Week 3-4: Core Panels**
- [ ] Chat Panel — message rendering, markdown, code highlighting, streaming
- [ ] Terminal Panel — xterm.js with WebSocket PTY connection
- [ ] Editor Panel — Monaco with PHP/Twig syntax, file open/save
- [ ] File Browser — tree view in sidebar, open in editor

**Week 5-6: Drupal Integration**
- [ ] Dev Panel — load from dev-panel.json, grouped buttons, send to chat
- [ ] Skills Panel — list skills, show descriptions, execute
- [ ] Settings panel — provider config, theme, workspace
- [ ] Multi-session chat (new, switch, history)
- [ ] Dockerfile with complete build pipeline
- [ ] Testing and polish

### Phase 2 — Enhanced (4-6 weeks)

- [ ] Watchdog Logs viewer (tail drupal logs in real-time)
- [ ] Database browser (tables, run queries)
- [ ] Git panel (status, diff, commit)
- [ ] Docker status panel (containers, logs)
- [ ] Performance profiler
- [ ] Keyboard shortcuts system
- [ ] Drag-and-drop panel resizing
- [ ] Mobile/tablet responsive layout

### Phase 3 — Advanced (future)

- [ ] Visual flow diagrams (module dependencies, request flow)
- [ ] Drupal config inspector
- [ ] AI-powered code review panel
- [ ] Collaborative sessions (shared workspace)
- [ ] Plugin system for custom panels
- [ ] Marketplace for community skills

---

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| PiClaw API changes | UI breaks | Pin to specific version; abstract API in client layer |
| PiClaw license issues | Can't distribute | Verify MIT/Apache license; contribute upstream |
| Monaco Editor bundle size | Slow load | Lazy-load editor, code-split |
| SSE streaming complexity | Chat bugs | Use proven SSE library; thorough error handling |
| Docker image size | Slow pull | Multi-stage build, shared layers |

---

## Skills Inventory (Carried Over from DrupalClaw)

All 15 custom Drupal skills from `drupal-custom/skills/` are preserved and loaded automatically. Additionally, 7 PiClaw built-in/operator skills are inherited from the base image.

### Drupal Custom Skills (15)

| Skill | Command | Description |
|-------|---------|-------------|
| **Stack Management** | | |
| drupal-serve | `drupal-serve` | Inicia stack Docker (PHP-FPM + nginx + BD). Entry point do utilizador. Detecta portas livres, pergunta tipo de BD, delega para drupal-stack. |
| drupal-stack | `drupal-stack [action]` | Gestão completa da stack: start/stop/status/restart/destroy. Gera docker-compose.drupal.yml dinâmico com suporte para MariaDB 11, PostgreSQL 16, ou SQLite. Auto-detect de portas, health checks, state.json para persistência de config. |
| drupal-init | `drupal-init` | Cria projecto Drupal novo via `composer create-project drupal/recommended-project`. Instala Drush, módulos essenciais (admin_toolbar, pathauto, token, metatag), configura settings.php, prepara estrutura Docker. Pergunta confirmação se projecto já existir. |
| **Code Quality** | | |
| drupal-analyze | `drupal-analyze` | Executa análise estática com PHPStan (nível 5) + PHPCS (Drupal + DrupalPractice standards) no código custom. Instala ferramentas automaticamente se não existirem. |
| drupal-fix | `drupal-fix` | Auto-fix com PHPCBF, re-executa análise para confirmar, reporta ficheiros alterados via git diff. |
| **Module Development** | | |
| drupal-module | `drupal-module [name]` | Scaffolda módulo custom completo: estrutura de directórios (src/Controller, src/Form, src/Plugin/Block, templates, config/install), .info.yml, .module, .routing.yml. |
| drupal-install | `drupal-install [module]` | Instala módulo contrib via Composer + activa com Drush. Detecta se executa local ou via container Docker. |
| **Database** | | |
| drupal-db-export | `drupal-db-export` | Exporta BD para ficheiro SQL comprimido (gzip) com timestamp no nome. |
| drupal-db-import | `drupal-db-import [file]` | Importa dump SQL (suporta .sql e .sql.gz), faz cache rebuild após importação. |
| drupal-db-query | `drupal-db-query [sql]` | Executa queries SQL via Drush sql:cli. Safety: queries SELECT directas, queries destrutivas requerem confirmação. |
| **Operations** | | |
| drupal-cr | `drupal-cr` | Cache rebuild via Drush (detecta automaticamente se usa container ou local). |
| drupal-status | `drupal-status` | Estado completo: versão Drupal, Drush status, módulos activos, PHP version + extensions, espaço em disco. |
| **Diagnostics** | | |
| drupal-logs | `drupal-logs` | Últimos 25 entries do watchdog + logs do container PHP/nginx. |
| drupal-debug | `drupal-debug` | Diagnóstico completo: watchdog errors + warnings, core requirements, PHP/nginx error logs, config sync status. Sugere correcções. |
| drupal-perf | `drupal-perf` | Análise de performance: cache bins, top 15 tabelas por tamanho, PHP config (memory, opcache), count de módulos activos, disk I/O benchmark. |

### PiClaw Built-in Skills (inherited from base image)

| Skill | Description |
|-------|-------------|
| reload | Reinicia PiClaw (restart-piclaw.sh) |
| schedule | Agenda tarefas periódicas |
| script-discovery-annotation | Anota scripts com JSDoc para discovery |
| send-message | Envia mensagens entre agents |

### PiClaw Operator Skills (inherited)

| Skill | Description |
|-------|-------------|
| graphite-power-chart | Gráficos de poder com Graphite |
| proxmox-management | Gestão de VMs Proxmox |
| token-chart | Visualização de uso de tokens |

### PiClaw Integration Skills (inherited)

| Skill | Description |
|-------|-------------|
| playwright | Automação de browser com Playwright |

### Skill Loading Architecture

```
Docker Image Build:
  ┌───────────────────────────────────────────────────┐
  │  COPY skills/ /home/agent/.pi/skills/             │  ← Baked into image
  │  COPY skills/ /workspace/.pi/skills/              │  ← Fallback copy
  └───────────────────────────────────────────────────┘

Container Startup (entrypoint.sh):
  ┌───────────────────────────────────────────────────┐
  │  For each drupal-* skill in /home/agent/.pi/skills│
  │    → Sync to /workspace/.pi/skills/ if newer      │  ← Live workspace
  │  Sync templates → /workspace/.piclaw/stack/       │
  │  Sync dev-panel.json (only if missing)            │
  │  Sync AGENTS.md (only if missing)                 │
  │  Generate .env.sh with branding (only if missing) │
  │    → PICLAW_ASSISTANT_NAME="DrupalClaw"           │
  │    → PICLAW_ASSISTANT_AVATAR=<base64 icon>        │
  └───────────────────────────────────────────────────┘

Runtime:
  ┌───────────────────────────────────────────────────┐
  │  PiClaw backend reads .pi/skills/*/SKILL.md       │
  │  GET /skills → lists all available skills          │
  │  Agent reads SKILL.md and executes steps in bash  │
  └───────────────────────────────────────────────────┘
```

All skills use a **common pattern** for Docker-awareness: they detect if a PHP container is running (via `docker ps --filter`), and route commands through `docker exec` if so, or use local `vendor/bin/drush` as fallback. This means skills work both inside and outside Docker automatically.

---

## Docker Stack Architecture

### Container Topology

```
Host Machine
├── DrupalClaw Container (PiClaw + PHP tools + React UI)
│   ├── Bun/TS: PiClaw backend (port 8080 → host 8084)
│   ├── React frontend (served as static files by PiClaw)
│   ├── PHP CLI 8.3, Composer 2, Drush
│   ├── Docker CLI (uses host socket)
│   └── /workspace (volume-mounted from host)
│
├── (Sibling containers — created by drupal-stack skill)
│   ├── drupal-dev-php-1     (PHP-FPM 8.3 + Drupal)
│   │   └── /var/www/html ← volume: ./drupal
│   ├── drupal-dev-nginx-1   (nginx:alpine)
│   │   └── port 8085 → 80
│   └── drupal-dev-db-1      (MariaDB 11 | PostgreSQL 16 | SQLite)
│       └── port 3306/5432
│
└── Docker Socket: /var/run/docker.sock (shared)
```

### Key Docker Files

**Dockerfile** (2-stage build):
- Stage 1: `alpine/git` clones PiClaw, copies overlay files on top
- Stage 2: `ghcr.io/rcarmo/piclaw:latest` base + PHP 8.3 + Docker CLI + Composer + Drush
  - Re-bundles `app.bundle.js` with overlay modifications
  - Copies skills to `/home/agent/.pi/skills/`
  - Copies templates to `/home/agent/.pi/templates/`
  - Wraps original entrypoint with custom `entrypoint.sh`

**Templates** (used by drupal-stack skill):
- `Dockerfile.php` — PHP 8.3-FPM with Drupal extensions (gd, mbstring, opcache, intl, bcmath, soap, apcu, pdo_mysql, pdo_pgsql, pdo_sqlite), Composer, dev-optimized PHP config (512M memory, display_errors=On)
- `nginx.conf` — Drupal clean URLs, PHP-FPM fastcgi, static file caching, security rules (deny .ht, private files), 64M upload limit
- `docker-compose.drupal.yml` — Template with placeholders (__DB_TYPE__, __PHP_PORT__, etc.) for dynamic generation

**Configuration Files**:
- `AGENTS.md` — System prompt for the Drupal agent (defines capabilities, stack rules, available commands)
- `dev-panel.json` — Dev Panel UI configuration with 5 button groups: Stack (4 buttons), Projecto (3), Código (4), Base de Dados (3), Diagnóstico (3)

### Running the Full Stack

```bash
# 1. Build and start DrupalClaw
docker compose up -d --build

# 2. Open workspace in browser
open http://localhost:8084

# 3. In chat, type: drupal-init
#    → Creates Drupal project via Composer

# 4. In chat, type: drupal-serve
#    → Asks DB choice (mariadb/postgres/sqlite)
#    → Generates docker-compose.drupal.yml
#    → Starts sibling containers (PHP-FPM + nginx + DB)
#    → Reports URL (http://localhost:8085)

# 5. Develop!
#    → File changes reflect immediately (volume mount)
#    → Use drupal-cr to clear caches
#    → Use drupal-analyze/drupal-fix for code quality
#    → Use drupal-debug/drupal-logs for diagnostics
```

---

## Getting Started (Development)

```bash
# 1. Clone and setup
git clone https://github.com/PauloCarv/drupalclaw-workspace.git
cd drupalclaw-workspace

# 2. Install frontend dependencies
cd frontend && npm install

# 3. Start PiClaw backend (for development)
docker run -d -p 3000:3000 -v $(pwd)/..:/workspace ghcr.io/rcarmo/piclaw:latest

# 4. Start frontend dev server (proxies to PiClaw)
npm run dev   # → http://localhost:5173

# 5. Production build
npm run build  # → dist/ served by PiClaw
```

---

## Summary

This plan creates a **professional, Drupal-branded IDE experience** by:

1. **Leveraging PiClaw's proven backend** — chat, memory, providers, tools (no reinventing the wheel)
2. **Building a modern React frontend** — tabs, panels, sidebar, responsive, themed
3. **Adding Drupal-specific panels** — Dev Panel, skills, Watchdog logs
4. **Shipping as a Docker container** — `docker run` and you're developing Drupal with AI

The MVP is achievable in 4-6 weeks and gives you a functional, visually appealing workspace that surpasses the current PiClaw UI for Drupal development.
