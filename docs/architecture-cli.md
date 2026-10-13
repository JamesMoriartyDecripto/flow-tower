# Architecture: CLI

Which file implements each `flow-tower` command: serve, connect, validate, copy, check-example, library, config, share, token, history, export, audit, report. Overview: [architecture.md](architecture.md); the server they start: [architecture-server.md](architecture-server.md).

| File | Open it when |
|---|---|
| `scripts/build-demo.ts` | Static demo for GitHub Pages: freezes the workspace and referenced files into `data/`, then builds the app in `demo` mode |
| `bin/flow-tower.js` | CLI commands: serve, init, connect, validate, copy, check-example, library, emit, guide, install-skill (all five skills) |
| `bin/config-file.js` | Plain-JS JSONC reader for `emit` (#90): starting a second Node with type stripping to load `src/server/config.ts` tripled its time (0.14 s to 0.41 s), and `emit` runs on every hook call, so the config is read here. Drops comments (newlines kept) and trailing commas; `src/server/config.ts` imports its `stripJsonc`, so both read the same JSONC. Also `local-server.json` (#187): a running server records its url and pid there (the first live one keeps it, cleared on exit), and `emit` and `simulate` post to it when no `--url` is given |
| `src/cli/validate.ts` | `validate --json` output |
| `src/cli/copy.ts` | `flow-tower copy --list` and `copy <example> [dest]` (#116): copies an example with its folder, refuses to overwrite, validates the copy, warns on dogfood towers (`root: ../..`), prints next steps |
| `src/cli/check-example.ts` | `flow-tower check-example <dir> [--json]` (#116): contribution pre-flight; validation 0/0, self-contained paths, README with Sources, personal-data scan, file sizes and git-ignored files |
| `src/cli/library.ts` | `flow-tower library add\|list\|remove` (#121): the user's own towers as a list of paths in the user folder's `config.json` (`library`). `checkPath` refuses the user folder and anything under the checkout's `examples/`, warns for a tower inside the checkout, and compares real paths so a symlink cannot smuggle one past; `bin/flow-tower.js` runs it with Node type stripping |
| `src/cli/connect.ts` | `flow-tower connect <url> [--token <token>] [--machine] [--user]` (#91): turns this machine into a satellite. Without `--token` (#164) it enrols on a tailnet hub (`/api/hub/enroll`), the machine id defaulting to the hostname slug (`src/cli/machine-id.ts`). Writes `role: satellite` plus url/token/user/machine to the user folder's `config.json` (`userHome()`, never the checkout nor a `flow-tower.local.json`), refuses a non-http(s) url, then sends one heartbeat so "does this token work?" is answered now. The token is written and sent, never printed; a 401/403 is reported as a refused token |
| `src/cli/config.ts` | `flow-tower config path|show` (#90; `show` prints the effective settings and warns when a file holding a token is not 0600) and the internal `config json` that `bin/flow-tower.js` reads so the precedence lives in one place. The token is always redacted: it is the sender credential, never the server's secret; run through Node type stripping like `token`, `history` and `validate` |
| `src/cli/share.ts` | `flow-tower share <dir> [--files] [--name]`, `share --list`, `unshare <name|dir> [--force]` (#164): uploads or removes a tower folder on the hub and records it in the config's `shares`, which the share sync keeps fresh |
| `src/cli/token.ts` | `flow-tower token add|list|revoke|pause|resume` (#83) over `src/server/tokens.ts`, run with Node type stripping |
| `src/cli/history.ts` | `flow-tower history export|delete|info` (#84): reads and erases the local SQLite history, allow-listed columns only |
| `src/cli/audit.ts` | `flow-tower audit <tower|dir> [--json]` (#173): inventory, findings, model-fit table |
| `src/cli/report.ts` | `flow-tower report <type> <input> [--source] [--drafts] [--html] [--out] [--list]` (#174): builds, checks, prints with Chromium; `tower-documentation` runs `export` |
