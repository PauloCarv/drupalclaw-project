# Memory outputs

Dream mode maintains this directory.

Dream and AutoDream maintain this directory via an out-of-band model turn on a temporary `dream:` channel.
The Dream channel is cleaned up after the cycle ends.

The model follows the original 4-phase Dream flow:
1. Orient
2. Signal
3. Consolidate
4. Prune and Index

Files created and refreshed here include:
- `MEMORY.md` — compact startup index
- `current-state.md` — compact Dream state snapshot
- `recent-context.md` — concise recent digest
- `user.md` — durable role and preference memory
- `feedback.md` — corrections and steering cues
- `project.md` — ongoing work and recent outcomes
- `reference.md` — note index and external pointers
- `days/YYYY-MM-DD.md` — optional sparse per-day memory when a day carries durable agent-facing signal beyond the daily note

Human-readable overview stays in `notes/daily/`. `notes/memory/days/` should not be a required mirror of `notes/daily/`.
`MEMORY.md` should link to a sparse day-memory file only when it actually exists; otherwise it should point back to the daily note.
