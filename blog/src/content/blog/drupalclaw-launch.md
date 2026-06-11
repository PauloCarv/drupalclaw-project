---
title: 'DrupalClaw: Bringing Agent-First Development to Drupal'
description: 'Every developer ecosystem is getting its AI moment. Drupal was being left behind, so I built a self-hosted workspace where an AI agent builds, debugs, and teaches Drupal.'
pubDate: '2026-06-09'
---

Every developer ecosystem is getting its AI moment. Cursor, Windsurf, Claude Code, Copilot Workspaces. The whole industry is converging on agent-first environments, where you stop memorising commands and start describing intent. The editor stopped being a place you type into and became a place you *delegate* from.

Drupal sat outside that wave. The CMS that quietly powers governments, universities, and a huge slice of the open web, while most of the AI-tooling energy was flowing everywhere else. Generic AI assistants can write you a PHP function, sure. But they have no idea what your project looks like, they can't run Drush, they can't bring up your stack, and they certainly can't install Drupal for you.

I wanted to push further, to see what it actually looks like when a Drupal workflow is genuinely agent-first, not just assisted. So I built **DrupalClaw**.

## What it is

DrupalClaw is a complete Drupal development environment, built agent-first from the ground up. One `docker compose up` gives you the full stack: PHP runtime, nginx, database, browser IDE, and an AI agent that genuinely understands Drupal. Not a plugin layered over your existing setup. The whole environment, designed to work by delegation.

Open one URL and you have:

- A **chat-driven AI agent** with real-time streaming responses
- An integrated **terminal** (real PTY), **Monaco editor**, and **file browser**
- A **Dev Panel** of one-click Drupal operations
- Multi-provider LLM support: **GitHub Copilot** (your existing subscription, no extra cost), **OpenAI, Anthropic**, with credentials stored in an encrypted local keychain
- **Usage & Performance** panel: real-time token analytics, cache efficiency, cost tracking, and estimated environmental impact (CO₂ and water saved by prompt caching)

Everything runs locally, in one container. Your code never leaves your machine except for the LLM API calls you explicitly configure. It's open source, and it's free.

It's also provider-agnostic. Connect GitHub Copilot (your existing subscription, no extra cost), OpenAI, or Anthropic. No new accounts, no new subscriptions if you already have one.

## You describe what you want. It does the work.

This is the part that matters. The agent isn't a chatbot bolted onto an editor; it's wired into more than 20 Drupal-specific skills, each one a real, executable workflow. You stay in control; it does the labour.

Spin up a fresh project? `drupal-init` scaffolds it via Composer (or clones from Git), configures `settings.local.php` with a generated `hash_salt`, sets up `services.local.yml` with Twig debugging, runs the full install and hands you working admin credentials at the end.

Bring up the stack? `drupal-serve` launches the whole thing: nginx + PHP-FPM + your choice of MariaDB, PostgreSQL, or SQLite.

Day to day, just ask: rebuild cache, scaffold a custom module, install contrib, import or export a database, run a query through Drush, tail the watchdog, check container logs. Code quality? PHPStan and PHPCS analysis, automated fixes with PHPCBF, full diagnostic and performance reports.

For more complex work, **Flows** let you chain skills, agent prompts, and MCP calls into automated multi-step pipelines, triggered manually or on a schedule. **Plans** give the agent a structured, reviewable task list: it proposes, you approve, it executes step by step. The difference between *"trust me"* and *"here's exactly what I'm going to do."*

## An accelerator for newcomers, too

Here's the angle I'm proudest of. Drupal has a famously steep on-ramp. Before a newcomer writes a single line of interesting code, they have to survive Composer, Drush, Docker, database configuration, and `settings.local.php`. That wall turns plenty of curious developers away.

DrupalClaw ships with two interaction modes. In **Learning mode**, the agent doesn't just execute; it teaches. After every non-trivial task it adds a compact *"💡 How to replicate manually"* block showing the real commands it ran, and offers a step-by-step explanation if you want to go deeper. You watch a working Drupal site come together, and you walk away understanding *how*, not just *that* it happened. Flip to **Expert mode** and all of that disappears: you get the result, nothing else.

For someone starting out, this collapses the most discouraging part of Drupal. You skip the days of environment wrangling and start building on minute one, picking up the Composer commands, the Drush invocations, and the project structure *in context*, as the agent uses them on your actual project. It's the difference between reading documentation and pair-programming with someone who narrates what they're doing.

The same tool that helps experts go faster catches newcomers at the very start.

## Under the hood

DrupalClaw is a custom **React 18 + TypeScript** frontend built on top of **PiClaw**, the streaming agent backend by [@rcarmo](https://github.com/rcarmo) running on Bun. The architecture deliberately keeps the backend untouched; all the Drupal intelligence lives in the overlay: skills, agent configuration, and the UI.

- **Real-time streaming** over SSE, so you see the agent's tool calls and reasoning as they happen
- **Workspace isolation**: every workspace gets a unique Docker Compose project name, so you can run multiple Drupal projects side by side without collisions
- **Persistent everything**: your project, chat history, flows, and credentials live in Docker volumes, so updates never touch your data
- **Multi-platform images** (amd64 + arm64) published to GHCR via CI, with semantic versioning
- **Token analytics built in**: the Usage panel shows real-time consumption, cache efficiency, cost, and environmental impact. With prompt caching at 94%+ hit rates, the CO₂ and water savings are measurable and visible

## Try it

Pick up the conversation where a blank Drupal project usually ends yours. Clone it, run it, and find out what becomes possible when the environment stops being the obstacle.

I'm proud of this one. Drupal developers deserve modern tooling, and I wanted to push what's possible with it. If you work with Drupal, try it, break it, star it, and tell me what's missing. Issues and PRs welcome.

The future of Drupal development is agent-first. Let's go.

**Repo:** [github.com/PauloCarv/drupalclaw-project](https://github.com/PauloCarv/drupalclaw-project)
