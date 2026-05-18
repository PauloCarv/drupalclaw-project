---
name: graphite-power-chart
description: Generate a Graphite chart (12h default) for a Zigbee device metric and post it to the web timeline.
distribution: public
---

# Graphite power chart

Generate a 12-hour chart for a Zigbee device and post it to the web UI timeline.
The script lives alongside this skill for easy adaptation to other data sources.

## Usage

### Power chart for the server closet UPS (default 12h)
```bash
bun /workspace/piclaw/runtime/skills/operator/graphite-power-chart/graphite-power-chart.ts \
  --device server_closet_ups_power --ipc
```

### Temperature chart (explicit metric + unit)
```bash
bun /workspace/piclaw/runtime/skills/operator/graphite-power-chart/graphite-power-chart.ts \
  --metric zigbee.server_closet_temperature.temperature \
  --label Temperature --unit "°C" \
  --ipc
```

### Override the window and resampling
```bash
bun /workspace/piclaw/runtime/skills/operator/graphite-power-chart/graphite-power-chart.ts \
  --device server_closet_ups_power --hours 24 --resample 10min --ipc
```

## Notes

- Default window is 12 hours.
- Resampling is auto-selected based on window length using Graphite `summarize(..., "avg")`.
- Use `--resample raw` to disable resampling.
- `--ipc` posts the chart to the web timeline as an inline SVG attachment (no push by default).
- Default Graphite base URL: `http://192.168.1.250:8086` (override with `--base-url` or `GRAPHITE_BASE_URL`).
- Set a full `--metric` to adapt to other data sources.
