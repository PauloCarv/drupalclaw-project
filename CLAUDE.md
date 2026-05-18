# DrupalClaw — AI-Powered Drupal IDE

## What is this project

DrupalClaw is a self-hosted, agent-first Drupal development workspace. It runs entirely in Docker and provides a browser-based IDE with chat, terminal, editor, file browser, and Drupal-specific panels — all powered by an AI agent that supports multiple LLM providers.

**Architecture**: Custom React 18 frontend on top of PiClaw backend (Bun/TS). PiClaw provides the chat engine, memory, provider abstraction, tool system, keychain, session management, and terminal PTY. We replaced PiClaw's default Preact UI with a modern React application served as static files.

**Owner**: Paulo Carvalho (paulo.sergiomc@gmail.com)

## Tech stack

### Frontend (what we built)
- React 18 + TypeScript 5
- Vite 5 (build + dev server)
- Tailwind CSS 3 (utility-first styling)
- Zustand 4 (state management)
- React Query 5 (@tanstack/react-query — server state/caching)
- Monaco Editor (@monaco-editor/react — code editor)
- xterm.js 5 (terminal emulator)
- Lucide React (icons)

### Backend (PiClaw — kept as-is, runs inside Docker)
- Bun runtime (fast TS execution)
- SQLite (chat history, memory, tasks)
- SSE (real-time streaming to frontend)
- WebSocket (terminal PTY)
- Encrypted keychain (AI provider credentials)

### Docker
- Base image: `ghcr.io/rcarmo/piclaw:latest`
- Added: PHP 8.3 CLI + Composer + Drush + Docker CLI
- Frontend build output served as static files by PiClaw
- Sibling containers for Drupal dev stack (PHP-FPM + nginx + DB)

## Project structure

```
drupalclaw-workspace/
├── CLAUDE.md                    # This file
├── PLAN.md                      # Detailed architecture plan + roadmap
├── docker/
│   ├── Dockerfile               # 2-stage build (clone PiClaw + overlay)
│   ├── docker-compose.yml       # Dev environment (port 8090)
│   ├── entrypoint.sh            # Startup script (syncs skills, sets branding)
│   └── overlay/                 # Files overlaid on PiClaw
├── backend/
│   └── config/
│       ├── AGENTS.md            # System prompt for the Drupal agent
│       └── dev-panel.json       # Dev Panel UI config (5 button groups)
├── frontend/                    # React application (our code)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx             # Entry point (React Query provider)
│       ├── App.tsx              # Root: OOBE check → OobeSetup or MainLayout
│       ├── api/
│       │   ├── client.ts        # HTTP client (apiGet/apiPost/apiPut/apiDelete)
│       │   ├── chat.ts          # Chat: timeline, postMessage, SSE
│       │   ├── providers.ts     # Providers: models, agent status, OOBE, card actions
│       │   ├── files.ts         # File operations (tree, read, write)
│       │   ├── skills.ts        # Skills listing
│       │   └── terminal.ts      # Terminal WebSocket
│       ├── components/
│       │   ├── oobe/OobeSetup.tsx      # OOBE wizard (provider auth flow)
│       │   ├── layout/
│       │   │   ├── MainLayout.tsx      # 3-column layout orchestrator
│       │   │   ├── TopBar.tsx          # Logo, provider selector, settings
│       │   │   ├── Sidebar.tsx         # Collapsible sidebar (chats, files, skills)
│       │   │   ├── TabStrip.tsx        # Main area tab management
│       │   │   ├── BottomPanel.tsx     # Collapsible bottom panel
│       │   │   └── ContextPanel.tsx    # Context/details panel
│       │   ├── chat/ChatPanel.tsx      # Chat messages + input
│       │   ├── editor/EditorPanel.tsx  # Monaco editor wrapper
│       │   ├── terminal/TerminalPanel.tsx  # xterm.js wrapper
│       │   ├── devpanel/DevPanel.tsx   # Drupal dev panel (grouped buttons)
│       │   ├── files/FileTree.tsx      # File browser tree
│       │   └── skills/SkillsList.tsx   # Skills browser
│       ├── hooks/
│       │   ├── useChat.ts       # Chat state + SSE + message normalization
│       │   ├── useFiles.ts      # File tree state
│       │   ├── useProviders.ts  # Provider management
│       │   └── useTerminal.ts   # Terminal connection
│       ├── stores/
│       │   ├── chatStore.ts     # Zustand: messages, streaming state
│       │   ├── layoutStore.ts   # Zustand: panel visibility, sizes
│       │   ├── editorStore.ts   # Zustand: open files, active tab
│       │   └── settingsStore.ts # Zustand: user preferences
│       └── themes/
│           └── global.css       # Tailwind + CSS variables (navy/blue/teal palette)
├── skills/                      # 15 Drupal-specific skills (SKILL.md each)
│   ├── drupal-init/             # Create new Drupal project via Composer
│   ├── drupal-serve/            # Start dev stack (PHP-FPM + nginx + DB)
│   ├── drupal-stack/            # Full stack lifecycle management
│   ├── drupal-cr/               # Cache rebuild
│   ├── drupal-status/           # Full Drupal status report
│   ├── drupal-module/           # Scaffold custom module
│   ├── drupal-install/          # Install contrib module
│   ├── drupal-analyze/          # PHPStan + PHPCS analysis
│   ├── drupal-fix/              # Auto-fix with PHPCBF
│   ├── drupal-db-export/        # Export DB to SQL dump
│   ├── drupal-db-import/        # Import SQL dump
│   ├── drupal-db-query/         # Run SQL queries via Drush
│   ├── drupal-logs/             # Watchdog + container logs
│   ├── drupal-debug/            # Full diagnostic report
│   └── drupal-perf/             # Performance analysis
├── config/                      # PiClaw agent config (mounted as /config in container)
│   ├── .pi/skills/              # Drupal skills (copied from skills/)
│   ├── .pi/agent/               # PiClaw agent settings + built-in skills
│   ├── .pi/templates/           # Docker templates for Drupal stack
│   ├── .pi/assets/              # DrupalClaw icon
│   └── settings.json
├── templates/                   # Docker templates (Dockerfile.php, nginx.conf, compose)
└── workspace/                   # Mounted as /workspace in container (Drupal project lives here)
```

## PiClaw API — critical endpoints

The frontend communicates with PiClaw via HTTP. These are the **actual working endpoints** (verified via curl testing):

### Chat / Messages
```
POST /agent/default/message   # Send message OR command — THIS is the correct endpoint
                               # (POST /post only stores to timeline without processing)
GET  /timeline?limit=N        # Recent messages (returns { posts: [...], limit, has_more })
GET  /sse/stream              # SSE for live updates (new messages, streaming chunks)
```

### Agent / OOBE
```
GET  /agent/status            # Agent status + OOBE flags (oobe.provider_ready)
GET  /agent/context           # Agent context info (provider, model, tokens)
GET  /agent/models            # Available models
POST /agent/card-action       # Submit Adaptive Card action (requires post_id of agent_response)
POST /agent/oobe/complete     # Mark OOBE as done
```

### Commands (sent via POST /agent/default/message)
```
/login                                        # Returns Card 1: provider picker
/login __step1 {"provider":"X"}               # Returns Card 2: auth form (OAuth URL, API key)
/login __step1method {"provider":"X","action":"oauth"}  # Select auth method
/login __step2 {"provider":"X","method":"oauth_check"}  # Poll OAuth completion
/login __step2 {"provider":"X","method":"api_key","api_key":"..."}  # Submit API key
/login __step3 {"provider":"X","model":"Y"}   # Activate model → done
```

### File Operations
```
GET  /workspace/tree          # File tree
GET  /workspace/file?path=... # Read file
PUT  /workspace/file?path=... # Write file
```

### Terminal
```
WebSocket /terminal/default   # PTY connection
```

## PiClaw timeline format

Posts from `/timeline` have this structure:
```json
{
  "posts": [
    {
      "id": 1,
      "chat_jid": "...",
      "timestamp": "2025-...",
      "data": {
        "type": "user_message" | "agent_response",
        "content": "message text",
        "content_blocks": [...],
        "agent_id": "...",
        "thread_id": "..."
      }
    }
  ],
  "limit": 50,
  "has_more": false
}
```

## OOBE (Out of Box Experience) — how it works

The OOBE flow authenticates the user with an AI provider before the main app loads.

1. `App.tsx` checks `isProviderReady()` on mount
2. If not ready → renders `<OobeSetup onComplete={...} />`
3. OobeSetup uses PiClaw's internal `__step` routing (NOT Adaptive Card actions, which have timing/expiration issues)
4. Flow: pick provider → auth (OAuth/API key) → pick model → done → MainLayout loads

### Key implementation detail: 409 Conflict handling
- Sending `/login` creates command session state in PiClaw
- A subsequent `/login __step1` can get 409 if the first is still active
- Solution: `client.ts` reads JSON body even on non-ok responses (attaches `__httpStatus`)
- OobeSetup sends a neutral `"ok"` message before `__step1` to clear pending state
- Has retry logic with exponential backoff for 409s
- Falls back to a static provider list if `/login` itself fails

### GitHub Copilot OAuth flow
- `__step1` returns: `Action.OpenUrl` with `https://github.com/login/device` + device code (e.g. `869C-8E07`)
- User opens URL in browser, enters code
- Frontend polls via `__step2` with `method: "oauth_check"` every 4 seconds
- On success: returns model picker card → `__step3` activates model

## How to run

### Development (frontend only)
```bash
cd frontend
npm install
npm run dev          # Vite dev server at http://localhost:5173
                     # Proxy API calls to PiClaw at http://localhost:8090
```

### Production (full stack)
```bash
cd docker
DOCKER_BUILDKIT=0 docker compose build   # DOCKER_BUILDKIT=0 is required
docker compose up -d
# Open http://localhost:8090
```

### Deploy frontend changes to running container
```bash
cd frontend
npm run build
# From drupalclaw-workspace/ directory:
docker cp frontend/dist/. docker-drupalclaw-1:/usr/local/lib/bun/install/global/node_modules/piclaw/runtime/web/static/drupalclaw/
```

## Design system

### Color palette (CSS variables in global.css)
- `navy-900` (#0a0e1a) — darkest background
- `navy-800` (#111827) — panels
- `navy-700` (#1a2035) — cards
- `navy-600` (#243049) — inputs, buttons
- `navy-500` (#2e3f5c) — borders
- `navy-400` (#4a5980) — muted text
- `navy-300` (#8899b8) — secondary text
- `drupal-blue` (#0678be) — primary brand
- `drupal-blue-light` (#0e90d9) — hover
- `ai-teal` (#2dd4bf) — AI/active accent
- `accent-green` (#22c55e) — success
- `accent-red` (#ef4444) — errors

### Layout pattern
3-column layout: collapsible sidebar (left) + main area with tabs (center) + optional context panel (right). Bottom panel for terminal/logs. Top bar with logo, provider selector, settings.

## Current status (May 2025)

### Working
- OOBE provider setup flow (OAuth + API key + model selection)
- GitHub Copilot authentication via OAuth device flow
- Chat sending/receiving messages via PiClaw
- SSE streaming for live updates
- Timeline message normalization (PiClaw format → ChatMessage)
- Full layout with sidebar, tabs, bottom panel
- Terminal panel (xterm.js)
- File tree panel
- Dev panel (Drupal command buttons)
- Skills list panel
- Docker build pipeline

### Next steps (Phase 1 MVP)
- Chat: markdown rendering, code syntax highlighting, streaming display
- Editor: Monaco file editing with save
- Terminal: WebSocket PTY connection
- File browser: create/rename/delete operations
- Multi-session chat support
- Settings panel
- Polish and testing

## Development workflow

After completing any development task:
1. Ask Paulo to test and confirm acceptance ("aceites?", "funciona?", or similar).
2. Only after acceptance: update `memory/project_drupalclaw.md` (status date + working features + known issues fixed) and `memory/feedback_conventions.md` (any new gotchas or patterns discovered).

Do not update memory speculatively — only after the feature is confirmed working.

## Conventions

- Language: TypeScript everywhere (strict mode)
- State: Zustand stores for UI state, React Query for server state
- API: All calls go through `api/client.ts` (apiGet/apiPost)
- Components: functional components with hooks, no class components
- Styling: Tailwind utility classes, custom CSS variables for theme colors
- Icons: Lucide React (consistent icon set)
- File naming: PascalCase for components, camelCase for hooks/stores/api

## Gotchas

1. **POST /post vs POST /agent/default/message**: `/post` only stores to timeline. `/agent/default/message` actually processes commands and triggers agent runs. Always use the latter.

2. **PiClaw Adaptive Card actions have timing issues**: `POST /agent/card-action` requires the `post_id` of the *agent_response* post (not user_message), and cards expire quickly. The `__step` routing approach bypasses this entirely.

3. **Docker build requires DOCKER_BUILDKIT=0**: The Dockerfile uses features that need the classic builder.

4. **Frontend is served as static files**: After build, the `dist/` contents must be copied to PiClaw's static directory inside the container. PiClaw serves them at the root URL.

5. **Skills detect Docker automatically**: Each Drupal skill checks if a PHP container is running and routes commands through `docker exec` if so, or uses local `vendor/bin/drush` as fallback.

6. **409 Conflict on rapid commands**: PiClaw can return 409 if a command is sent while another is still processing. The frontend handles this with retries and a neutral message to clear state.
