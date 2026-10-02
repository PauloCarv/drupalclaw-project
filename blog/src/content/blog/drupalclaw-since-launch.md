---
title: 'DrupalClaw, Since Launch: What Happened Next'
description: 'DrupalClaw launched in June as a bet on agent-first Drupal development. Here is what got validated and what shipped.'
pubDate: '2026-09-23'
tag: 'Update'
---

DrupalClaw launched in June with a simple claim: Drupal development can be agent-first, not just assisted. A self-hosted workspace where an AI agent runs your stack, scaffolds modules and debugs errors while you stay in control.

That was the pitch. Here is what happened once people started using it.

## It didn't stay a side project

The first signal came from inside NTT DATA. DrupalClaw was my submission to the internal "GenAI QuickWins Challenge", and it made it through to the pitch, where the panel placed it second. The placing mattered less than the question it forced: does this hold up outside my own laptop, in front of people who didn't build it?

Then came [an interview with The Drop Times](https://www.thedroptimes.com/interview/71976/drupalclaw-agent-first-development-boundaries). I was really happy to see DrupalClaw featured there. The conversation went past the usual AI tooling talk and into the practical side of agent-first development: where automation helps, where a developer's judgement is still essential, and how to make these workflows safer and more repeatable. Having the Drupal community take the project seriously means a lot.

I didn't plan any of this. It did tell me that the gap DrupalClaw tries to close is real, and not just something I felt myself.

## Three things that shipped

Three features moved DrupalClaw from a working demo to something closer to a real tool.

### Usage & Performance panel

Every turn now tracks tokens, cost and cache hit rate, broken down by provider and model and kept across reloads. The part I like most is what it does with prompt-cache efficiency. With hit rates above 90%, the panel turns the compute saved into CO₂ and water, and into roughly how many tree-days that equals. It's hard to treat responsible AI usage as a slogan once the number is on your screen.

### Code intelligence with GitNexus

The `drupal-index` skill indexes your project and registers a code-graph MCP server. The agent can then answer "what calls this function?" or "what breaks if I change this?" by querying symbols and relationships, instead of grepping the filesystem turn after turn. On a mid-sized test project that meant 69 files, nearly 700 symbols and almost 1,000 edges it could reason over directly.

### Marketplace and natural-language skills

You can point DrupalClaw at any catalog that publishes skills in an open JSON format, browse it from its own tab and install what you need without editing a config file. You also no longer need the exact `/skill-name` syntax: typing a skill's name in plain words is enough for the agent to find it. The skill count went from about twenty at launch to twenty-four, and anyone can now add their own without waiting on me.

## Try it

If you tried DrupalClaw in June, the Marketplace and the Usage panel are worth another look. If you haven't, the launch-week rough edges are fixed, so it's a better time to start.

Clone it, run it, break it, and tell me what's missing. Issues and PRs are welcome, and if you build a skill worth sharing, the Marketplace is where it belongs.

**Repo:** [github.com/PauloCarv/drupalclaw-project](https://github.com/PauloCarv/drupalclaw-project)

**Read the launch story:** [DrupalClaw: Bringing Agent-First Development to Drupal](/blog/drupalclaw-launch)
