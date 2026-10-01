---
title: 'DrupalClaw, Since Launch: What Happened Next'
description: 'DrupalClaw launched in June as a bet on agent-first Drupal development. Here is what got validated and what shipped.'
pubDate: '2026-09-23'
---

DrupalClaw launched in June with a simple claim: Drupal development could be genuinely agent-first, not just assisted. A self-hosted workspace where an AI agent runs your stack, scaffolds modules, and debugs errors, while you stay in control.

That was the pitch. This is what happened after people actually started using it.

## It didn't stay a side project

The first signal came from inside NTT DATA, where DrupalClaw was submitted as the use case for the internal "GenAI QuickWins Challenge", picked as one of the entries worth pitching, reviewed by the panel, and placed second. The placing mattered less than the question it forced: does this hold up outside my own laptop, in front of people who didn't build it?

Then came [an interview with The Drop Times](https://www.thedroptimes.com/interview/71976/drupalclaw-agent-first-development-boundaries). I'm really happy to see DrupalClaw featured there. What I appreciated most is that the conversation went beyond the usual AI tooling discussion and focused on the practical side of agent-first development: where automation helps, where developer judgement is still essential, and how to make these workflows safer and more repeatable. Seeing the project recognised by the Drupal community like this means a lot.

None of that was the plan going in. All of it confirmed the same thing: the gap DrupalClaw is trying to close is real, not just something I personally felt.

## Three things that actually shipped

Validation is nice. Shipping is the point. Three features moved DrupalClaw from "working demo" to something closer to a real tool.

**A Usage & Performance panel that makes the invisible parts visible.** Every turn now tracks tokens, cost, and cache hit rate, broken down by provider and model, persisted across reloads. The part I like most is what it does with prompt-cache efficiency: at hit rates above 90%, the panel converts the saved compute into CO₂ and water saved, and roughly how many tree-days that's worth. Responsible AI usage stops being a slogan when you can see the number.

**Code intelligence via GitNexus.** The `drupal-index` skill indexes your project and registers a proper code-graph MCP server, so the agent can answer "what calls this function" or "what breaks if I change this" by querying symbols and edges instead of grepping the filesystem turn after turn. On a mid-sized test project that's 69 files, nearly 700 symbols, and almost 1,000 edges the agent can now reason over directly.

**A Marketplace, and skills you can just talk to.** You can now point DrupalClaw at any catalog that exposes skills in an open JSON format, browse it from a dedicated tab, and install what you need without touching a config file. And you no longer need to remember the exact `/skill-name` syntax: typing a skill's name in plain language is enough for the agent to pick it up. Small thing, but it's the difference between a tool you have to learn and one you can just use. The skill count has grown from roughly twenty at launch to twenty-four today, and now anyone can add their own without waiting on me.

## Try it

If you tried DrupalClaw in June, the Marketplace and Usage panel alone are worth another look. If you haven't yet, this is a good time to start: the rough edges from launch week are fixed, and there's a lot more under the hood.

Clone it, run it, break it, and tell me what's missing. Issues and PRs are welcome, and if you build a skill worth sharing, the Marketplace is exactly where it belongs.

**Repo:** [github.com/PauloCarv/drupalclaw-project](https://github.com/PauloCarv/drupalclaw-project)
**Read the launch story:** [DrupalClaw: Bringing Agent-First Development to Drupal](/blog/drupalclaw-launch)
