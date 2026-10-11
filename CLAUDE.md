# Flow Tower: notes for Claude

3D tower visualizer for agentic systems. GitHub issues are the source of truth for remaining work; [NEXT.md](NEXT.md) is the current handoff.

## Load on demand (do not read everything up front)

| Task | Read |
|---|---|
| Change code | [docs/architecture.md](docs/architecture.md): which file owns what, then only those files |
| Change the YAML schema | [docs/schema.md](docs/schema.md) + `src/core/schema.ts` |
| Write or fix a tower | [docs/what-goes-where.md](docs/what-goes-where.md) (layers, nodes, edges, nested towers); [examples/README.md](examples/README.md): copy the closest example; [docs/generate-a-tower.md](docs/generate-a-tower.md) for codebases |
| Live events / integrations | [docs/realtime.md](docs/realtime.md), `src/core/adapters.ts`, `integrations/` |
| Voice (commands, agent, spoken replies) | [docs/voice.md](docs/voice.md), `src/app/voice/` (parser, mic, agent, tools), `src/server/voice.ts`, the `voice-commands` example tower |
| Your own towers (copy, starter, from scratch) | [docs/getting-started.md](docs/getting-started.md) |
| Team hub, command center, config, satellite | [docs/command-center.md](docs/command-center.md) (setup, config precedence), [docs/hub-reference.md](docs/hub-reference.md) (security model, recipes), then `src/server/{config,hub,auth,relay}.ts` as needed |
| The command-center kit (deploy files) | [examples/command-center/README.md](examples/command-center/README.md) |
| Cost and model choice | [skills/flow-tower-costs/SKILL.md](skills/flow-tower-costs/SKILL.md) |
| The agent skill | [skills/flow-tower/SKILL.md](skills/flow-tower/SKILL.md), [reference.md](skills/flow-tower/reference.md) |

## Conventions

- English only, everywhere: code, docs, examples, commits. Exception: customer-facing sample documents for Italian customers (sales-pipeline quote/contract, invoicing-fic dunning letters), declared in their README.
- Never work on `main`: one branch per feature or issue (`feat/…`, `fix/…`) from an up-to-date `main`. The user merges, or asks Claude to. `main` is protected by the "Protect main" ruleset (PR + CI + CODEOWNERS review; the admin can merge their own PRs, nobody can push or force-push).
- Stacked PRs: merge bottom-up with merge commits; retarget the next PR to `main` *before* deleting a merged base branch (GitHub closes PRs whose base disappears).
- Commit and push after every completed piece of work; then check CI (`gh pr checks`): local runs can pass on files git ignores.
- Update `CHANGELOG.md` under `[Unreleased]` (Added / Changed / Fixed / Security).
- Check current library docs (Context7) before using an API: React 19, r3f 9, drei 10, three 0.186, Vite 8, zod 4, TypeScript 7.
- Files under ~400 lines; plain functions over classes; comments explain *why*.
- Schema change: `npm run schema`, then docs/schema.md and skills/flow-tower/reference.md.
- Examples: researched and realistic, real files behind every reference, 0 errors and 0 warnings (`tests/examples.test.ts`), README with sources, illustrative numbers labelled.
- Verify UI changes in a browser (Playwright screenshots), not only via typecheck.

## Gotchas

- `.gitignore` has `*.log` with an exception for `examples/**/*.log`. The examples test fails on any git-ignored file under `examples/` (e.g. `.claude/settings.local.json`).
- vitest only collects `tests/**/*.test.ts`: examples ship sample `*.spec.ts` files.
- YAML: quote labeled edge shorthand (`- "a -> b [call]: label"`) and one-line map values containing commas or colons.
- `/api/events` must answer **204 with an empty body**: Claude Code HTTP hooks read a JSON body as a hook decision.
- Rendering is batched per layer (instanced meshes, LineSegments2, troika `BatchedText`). Never reintroduce per-node meshes or `<Text>`: 55 nodes dropped to 14 FPS that way.
- Never mutate zustand state in place (useSyncExternalStore loops). The live store is copy-on-write.
- The camera projection is offset to the free area between HUD panels (`scene/hudFrame.ts`): frame things with `fitScale`, not the raw viewport.
- CSS `zoom` (interface size) does not rescale `vh`/`vw`: use `var(--vh)` / `var(--vw)` in HUD styles.
- An empty env var counts as unset (`FLOW_TOWER_HUB=''` never overrides the config file): keep it that way in `src/server/config.ts`.
- The `token` in config.json is a **sender** credential (emit, satellite relay), never this server's secret: the server's secret is `FLOW_TOWER_TOKEN` or `tokens.json`.
- The hub lights only towers in its own library: events from a machine whose tower is not there match no node.
- A test that spawns `serve` or the CLI needs an explicit `{ timeout }` (see `tests/connect.test.ts`).
- Each Vite restart (editing `src/server/*`) can leave the old server on its port and bind the next one (#99): check `lsof -nP -iTCP -sTCP:LISTEN` before trusting a port.
- Some environments block shell commands containing `.env` or `pip install`: use `import { env } from 'node:process'` and file-edit tools.
- zsh does not word-split unquoted `$var`; use `${=var}`.
- Tower files read only inside their project (git root or opened folder; `loader.ts` `projectOf`). A dogfood tower can use `root: ../..` because the repo is the project.
- Each server port has its own Vite cache (`node_modules/.vite/port-<port>`, set in `bin/flow-tower.js`): never point two servers at one cache, or open pages fail on renamed dependency chunks.
- E2E: Playwright's bundled Chromium does not run on macOS 13, so `playwright.config.ts` uses `channel: 'chrome'`. Tests read state through `window.__flowTower.store` (dev only). Never edit `src/` or `examples/` while `npm run e2e` runs: HMR and library reloads make it flaky. Playwright empties `test-results/` at start: do not redirect output there. A CLI `--reporter` replaces the config reporters, so `examples/release-auditor/reports/e2e.log` is only written by a plain `npm run e2e`; commit it only from a full run. E2E specs cannot import app modules that load font files (`theme.ts` and what imports it): Node has no loader for `.woff`.

## Commands

`npm run dev` · `npm run check` · `npm run build:demo` (static demo in `dist-demo/`, deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to main) · `npm run e2e` (Playwright, installed Chrome; reuses a running dev server) · `npm run simulate -- <project>` · `npm run stress -- <layers> <nodes>` · `node bin/flow-tower.js validate <path> --json`
