# Mode plugin repo

**Purpose:** conventions for working in this repo, the modes-and-styles system with its skills, and the contracts it keeps with the sidecar.
**Loads:** when you touch any file under `projects/Cela/mode`.
**Never put here:** global behaviour goes to `~/.claude/CLAUDE.md` · code and TS style go to `~/.claude/on-demand/code-style.md` · how to build an artifact goes to the `create-artifact` skill · the sidecar's own conventions go to `projects/Cela/sidecar/CLAUDE.md` · the Cela product domain goes to `projects/Cela/CLAUDE.md`.

GitHub `EthanITA/Mode`, worked on `main`.

---

## Contracts with the sidecar · fires: when touching `mode forget`, the review layer or the per-conversation lists

The sidecar is its own plugin in `cela-sage/sidecar` and reaches this repo only through files and one CLI verb, so a change to any of these breaks it without a single failing test here:

- `bin/mode --session <key> forget`, which the sidecar runs when a conversation is removed, found through `~/.claude/mode/plugin-root`.
- `skills/create-artifact/assets/review-layer.html`, whose `rv-seed` block and `/api/sessions/message` post the sidecar reads and answers, and the trailing `<!-- rv:seed -->` block `artifact review` adds to a `.md`.
- `~/.claude/artifacts/session-<key>`, written by `artifact stamp`, `touch` and the observe hook, which the sidecar watches to list and announce a conversation's pages.
