# Mode plugin repo

**Purpose:** conventions for working in this repo, which ships two things, the modes-and-styles system and the sidecar, and where the line between them sits.
**Loads:** when you touch any file under `projects/Cela/mode`.
**Never put here:** global behaviour goes to `~/.claude/CLAUDE.md` · code and TS style go to `~/.claude/rules/code-style.md` · how to build an artifact goes to the `create-artifact` skill · the Cela product domain goes to `projects/Cela/CLAUDE.md`.

GitHub `EthanITA/Mode`, worked on branch `sidecar-v6`.

---

## Naming · fires: on every user-facing string and new sidecar code

The product and its CLI are **the sidecar**, never "Mode". The plugin is still named `mode` internally (its id in `.claude-plugin/plugin.json`, `MODE_PLUGIN_ROOT`, `lib/mode`, `skills/mode`) because that identity is the modes-and-styles system, not the sidecar, and splitting the two is its own epic. So user-facing surfaces, the `bin/_sidecar.ts` CLI, its config and its output read as sidecar and carry no "Mode"; the internal plumbing keeps the `mode` name until the split lands.

## The two surfaces · fires: when the sidecar's desktop-versus-web behaviour matters

A Web artifact renders one of two ways, and which one is the surface chosen in `sidecar setup`, stored in `~/.claude/sidecar/config.json` as `{ surface: "desktop" | "web" }`:

- **desktop** is the Electron shell in `desktop/`, where a Web artifact is a real top-level Chromium page signed in with imported Chrome cookies, heavier because it is a separate Chromium but with no framing refusals.
- **web** is a tab in Chrome against the sidecar, where a Web artifact is framed through the rewriting proxy, light but broken on framing-hostile sites.

The running app knows which it is through `window.sidecarShell`, injected by the desktop shell's preload and absent in a plain browser. The user agent cannot be used, because the shell strips its Electron token on purpose so framed pages see plain Chrome.
