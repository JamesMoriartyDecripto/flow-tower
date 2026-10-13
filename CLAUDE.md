# Flow Tower: notes for Claude

3D tower visualizer for agentic systems. GitHub issues are the source of truth for remaining work; [NEXT.md](NEXT.md) is the current handoff.

## Load on demand (do not read everything up front)

| Task | Read |
|---|---|
| Change code | [docs/architecture.md](docs/architecture.md): data flow, core, documents and reports; then the part you touch: [server and hub](docs/architecture-server.md), [CLI](docs/architecture-cli.md), [app, scene, HUD](docs/architecture-app.md); then only those files |
| Change the YAML schema | [docs/schema.md](docs/schema.md) + `src/core/schema.ts` |
| Write or fix a tower | [docs/what-goes-where.md](docs/what-goes-where.md) (layers, nodes, edges, nested towers); [examples/README.md](examples/README.md): copy the closest example; [docs/generate-a-tower.md](docs/generate-a-tower.md) for codebases |
| Live events / integrations | [docs/realtime.md](docs/realtime.md), `src/core/adapters.ts`, `integrations/` |
| Voice (commands, agent, spoken replies); where personal data, keys, tokens live (user folder) | [docs/voice.md](docs/voice.md), `src/app/voice/` (parser, mic, agent, tools), `src/server/voice.ts`, the `voice-commands` example tower |
| Your own towers (copy, starter, from scratch, validate, simulate, your library) | [docs/getting-started.md](docs/getting-started.md), [skills/flow-tower-my-library](skills/flow-tower-my-library/SKILL.md) |
| Use an example / contribute a tower (start from an example; add your tower to the examples gallery) | [skills/flow-tower-use-example](skills/flow-tower-use-example/SKILL.md), [skills/flow-tower-contribute](skills/flow-tower-contribute/SKILL.md) |
| Team hub, command center, Hub panel (H), config, satellite, connect a device, share/unshare a tower | [docs/command-center.md](docs/command-center.md) (setup, config precedence), [docs/hub-reference.md](docs/hub-reference.md) (security model, recipes), [docs/hub-alerts.md](docs/hub-alerts.md) (alerts), [skills/flow-tower-command-center](skills/flow-tower-command-center/SKILL.md), [skills/flow-tower-satellite](skills/flow-tower-satellite/SKILL.md) (guided connect and share), then `src/server/{config,hub,auth,relay,enroll,shared-towers,share-sync}.ts` as needed |
| The command-center kit (deploy files) | [examples/command-center/README.md](examples/command-center/README.md) |
| Release a version | [NEXT.md](NEXT.md) § Releasing, `examples/release-auditor` |
| Reports (`flow-tower report`, types, print engine, checks) | [docs/reports.md](docs/reports.md), `src/report/`, [skills/flow-tower-report](skills/flow-tower-report/SKILL.md), [examples/report-studio](examples/report-studio/README.md) |
| Cost and model choice | [skills/flow-tower-costs/SKILL.md](skills/flow-tower-costs/SKILL.md) |
| Improve a tower, best practices, audit rules (AUD01-AUD11), role classes | [docs/best-practices.md](docs/best-practices.md), [skills/flow-tower-optimize](skills/flow-tower-optimize/SKILL.md), `src/core/{audit,roles}.ts`, [examples/tower-optimizer](examples/tower-optimizer/README.md) |
| How the hub works inside | [examples/team-hub](examples/team-hub/README.md): the tower of the hub's own code |
| Model benchmarks | [examples/model-benchmark/README.md](examples/model-benchmark/README.md) |
| The agent skill | [skills/flow-tower/SKILL.md](skills/flow-tower/SKILL.md), [reference.md](skills/flow-tower/reference.md) |
| Build work with the squad (coder/reviewer through OpenRouter) | [tools/squad/README.md](tools/squad/README.md) |

## Conventions

- English only, everywhere: code, docs, examples, commits. Exception: customer-facing sample documents for Italian customers (sales-pipeline quote/contract, invoicing-fic dunning letters), declared in their README.
- Never work on `main`: one branch per feature or issue (`feat/…`, `fix/…`) from an up-to-date `main`. The user merges, or asks Claude to. `main` is protected by the "Protect main" ruleset (PR + CI + CODEOWNERS review; the admin can merge their own PRs, nobody can push or force-push).
- Stacked PRs: merge bottom-up with merge commits; retarget the next PR to `main` *before* deleting a merged base branch (GitHub closes PRs whose base disappears).
- Commit and push after every completed piece of work; then check CI (`gh pr checks`): local runs can pass on files git ignores.
- Commits follow Conventional Commits and are signed off (`git commit -s`, DCO; CI rejects unsigned commits). Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).
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
- The CLI server (`bin/flow-tower.js`: `npm run dev`, the e2e server, every `flow-tower` serve) loads `vite.config.ts` once and passes it inline, so editing `src/server/*` or `src/core/*` never restarts it: restart it by hand to run new server code. In-process restarts leaked the old server each time (#99, upstream Rolldown #10887).
- Some environments block shell commands containing `.env` or `pip install`: use `import { env } from 'node:process'` and file-edit tools.
- zsh does not word-split unquoted `$var`; use `${=var}`. `tools/squad/steps.sh` is bash since #176. The Linux test server has no zsh and Node 20 as `/usr/bin/node`: use `/opt/node22/bin` (`NODE=/opt/node22/bin/node` for `steps.sh`).
- On the test server, port 5317 is the live hub (the `flowtower` systemd service): run e2e and scratch servers on another port, never `reuseExistingServer` against it.
- `pkill -f "<pattern>"` also matches the shell running it when the pattern is in its own command line: kill by PID.
- Code passed to Playwright's `page.evaluate` runs as plain JS: no TypeScript syntax inside it (a generic became a comparison).
- `flow-tower export --pdf` needs a Playwright browser (`npx playwright install chromium`); the document page waits for 3D snapshots (software WebGL on a server: 20-60 s per page). e2e tests not about 3D use `snap=0`.
- Tower files read only inside their project (git root or opened folder; `loader.ts` `projectOf`). A dogfood tower can use `root: ../..` because the repo is the project.
- Each server port has its own Vite cache (`node_modules/.vite/port-<port>`, set in `bin/flow-tower.js`): never point two servers at one cache, or open pages fail on renamed dependency chunks.
- E2E: Playwright's bundled Chromium does not run on macOS 13, so `playwright.config.ts` uses `channel: 'chrome'`. Tests read state through `window.__flowTower.store` (dev only). Never edit `src/` or `examples/` while `npm run e2e` runs: HMR and library reloads make it flaky. Playwright empties `test-results/` at start: do not redirect output there. A CLI `--reporter` replaces the config reporters, so `examples/release-auditor/reports/e2e.log` is only written by a plain `npm run e2e`; commit it only from a full run. E2E specs cannot import app modules that load font files (`theme.ts` and what imports it): Node has no loader for `.woff`.

## Commands

`npm run dev` · `npm run check` · `npm run build:demo` (static demo in `dist-demo/`, deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to main) · `npm run e2e` (Playwright, installed Chrome; reuses a running dev server) · `npm run simulate -- <project>` · `npm run stress -- <layers> <nodes>` · `node bin/flow-tower.js validate <path> --json`
