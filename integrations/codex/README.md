# Codex

- **Hooks** (recommended): copy `hooks.json` to `~/.codex/hooks.json` (or a repo's `.codex/hooks.json`), then approve the hooks in Codex with `/hooks`. Repo-level hooks only run in trusted projects.
- **`notify`** (legacy, turn ends only): merge `config.toml` into `~/.codex/config.toml`.
- **`codex exec --json`**: `codex exec --json "…" | flow-tower emit --source codex`.

The commands call `flow-tower`: run `npm link` in this repo first, or use `node /path/to/flow-tower/bin/flow-tower.js`. See [docs/realtime.md](../../docs/realtime.md).
