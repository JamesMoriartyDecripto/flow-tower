# Charters: Flow Tower v0.1.0 sweep

Release candidate: `main` at the commit named in the report. A finding must reproduce on that commit.

## Trust boundaries (threat model)

| Boundary | Who is on the other side | What must hold |
|---|---|---|
| `127.0.0.1:5317` HTTP | Any local process, and any web page the user visits (the browser can reach localhost) | Binds to loopback only; no endpoint writes files; `/api/file` never leaves the tower roots (symlinks included) |
| `POST /api/events` | Agents, hooks, scripts; also cross-origin pages | Malformed or huge bodies cannot crash the server; answers 204 with an empty body; optional `FLOW_TOWER_TOKEN` |
| Tower YAML and referenced files | The user's own repositories, possibly a cloned third-party repo | Parsing never executes anything; rendered text is never injected as HTML |
| Static demo (planned) | Anyone on the internet | Ships only pre-baked, referenced example files; no secrets in history |

## Charters

| Finder | Area | Goal | Out of scope |
|---|---|---|---|
| Correctness | `src/core`, `src/app` state, keyboard handler, loader | Wrong behavior a user or an agent can trigger | Style, naming, refactors |
| Security | `src/server`, `bin/`, `integrations/`, anything rendering user text | Exploitable paths across the boundaries above | Generic hardening wishes without a path |
| UX + a11y | HUD, keyboard model, layout at every size, axe report | Things a keyboard-only or small-screen user cannot do | Taste |
| Performance | `src/app/scene`, live store, listeners and timers | Idle cost, leaks, frame drops on big towers | Micro-optimizations without a measurement |
| Docs | Every tracked `.md` | Broken rendering, broken links, facts the code contradicts | Rewording |
