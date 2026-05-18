---
name: token-chart
description: Generate a 7-day token usage chart (all chats) and post it to the web UI timeline.
distribution: public
---

# Token chart

Generate a 7-day token usage chart (all chats) and post it to the web UI timeline as a message.

## Steps

1. Run the standard chart script (default mode):
   ```bash
   bun /workspace/piclaw/runtime/skills/operator/token-chart/token-chart.ts
   ```

2. Run the **alternative provider+model mode** (stacked series by provider + model):
   ```bash
   bun /workspace/piclaw/runtime/skills/operator/token-chart/token-chart.ts --mode provider-model
   ```

3. Post safely to the web chat (JSON-encoded, no Pushover nudge):
   ```bash
   bun /workspace/piclaw/runtime/skills/operator/token-chart/token-chart.ts --ipc
   ```

4. If you explicitly want a Pushover nudge as well:
   ```bash
   bun /workspace/piclaw/runtime/skills/operator/token-chart/token-chart.ts --ipc --nudge
   ```

## Notes

- `--ipc` posts the chart as an inline SVG attachment via the IPC media mechanism.
- Non-IPC output renders as embedded SVG via markdown image syntax.
- Styling is handled by the web UI CSS (token-chart image selector).
- Numbers are formatted using K/M in labels and summaries.
- Uses the `token_usage` table by default; pass `--source sessions` (or `--sessions-dir`) to read session JSONL files.
- The default chart combines normal usage and `source = "autoresearch"` usage into a single per-day stacked bar, with cached segments below uncached ones.
- `--mode provider-model` draws an alternative chart grouping tokens by provider/model.
- Use this on demand (not scheduled yet).
