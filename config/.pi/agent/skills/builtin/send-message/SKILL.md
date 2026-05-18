---
name: send-message
description: Send a message to the chat immediately without waiting for the current task to finish. Useful for acknowledging requests or sending progress updates while working.
distribution: public
---

# Send a Message

Write a JSON file to the piclaw IPC directory to send a message right away.

## Usage

```bash
cat > "$PICLAW_DATA/ipc/messages/msg_$(date +%s).json" <<EOF
{
  "type": "message",
  "chatJid": "$PICLAW_CHAT_JID",
  "text": "Your message here",
  "media": [
    {
      "path": "/absolute/path/to/chart.svg",
      "content_type": "image/svg+xml",
      "inline": true
    }
  ]
}
EOF
```

## When to Use

- Acknowledge a request before starting longer work: "On it, this might take a minute..."
- Send progress updates during a multi-step task
- Deliver partial results while continuing to work

## Notes

- Messages are picked up by piclaw within ~1 second
- The IPC file is deleted after the message is sent
- Use WhatsApp-compatible formatting: *bold*, _italic_, • bullets, ```code```
- You can attach local media files by adding an optional `media` array
  - Each item: `{ path, content_type?, filename?, inline? }`
  - `path` is filesystem path to an existing file
  - `content_type` and `filename` override detected values
  - `inline: true` hints image rendering inside the message card
- Missing/unreadable media paths generate an inline warning, and message delivery continues for remaining files
- Do NOT use this for your final response — just return that normally

## Environment

- `PICLAW_DATA` — piclaw data directory (contains `ipc/messages/`)
- `PICLAW_CHAT_JID` — JID of the chat that triggered this invocation
