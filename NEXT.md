# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-12

- **v0.8.0 released:**
  - voice: scroll, the Hub panel, filters, compare (#145);
  - command-center and satellite skills (#148);
  - the model benchmark's first full run, with live tower events (#105);
  - `--warm`, `--batch` and `cache_control` (#149);
  - the CLI split (#126).

  Gates and e2e: [report](examples/release-auditor/reports/v0.8.0.md).
- **Since v0.8.0 (unreleased):**
  - #122: contribution path, community profile at 100%, every commit signed off (DCO), `dco` is a required check;
  - #156: squad cost per issue, `node tools/squad/cost.mjs <n>`, posted on each issue when it closes;
  - #160: voice `live_status`;
  - #99: dev-server memory leak fixed; the CLI loads its Vite config once and passes it inline (upstream Rolldown #10887 still open);
  - #95 part 1: live chips name the machine, library cards list recent machines.
- **Done on 2026-10-12, in open PRs** (all with CI green, waiting for the maintainer's merge):

  | PR | Issue | What | Base |
  |---|---|---|---|
  | #168 | #166 | command-center kit findings: Node 22 in /opt, `.vite-temp`, Serve admin step, quiet `/api/sharing` for remote viewers, Vite warmup, one-line card footer | `main` |
  | #170 | #164 | one-step `connect` on a tailnet (the hub mints the token for a viewer), `share` / `unshare` / auto-sync of towers (YAML only by default, `--files` opt-in), guided satellite skill tested by two fresh agents | #168 |
  | #172 | #165 | library: source badge per card (THIS HUB or the device), FROM filter row with online dots, `?source=`, voice `source` | #170 |
  | #171 | #169 | squad pace: `SQUAD_PACE=now` (loop, faster models, no batch) / `relaxed` (oneshot) / `overnight` (Batch API); `pack.mjs`; real batch run took ~2 h | `main` |
  | #178 | #176 | squad runner: bash `steps.sh` (`NODE`), `Files:` check makes a step RED when a listed path is untouched, `Known gaps:` printed per step, `--write tools/squad` fix | #171 |
  | #175 | #65 | tower documentation as PDF: levels 1-4, audit-report style, letterhead, 3D snapshot and infographics per tower, every tower and file of the project, `flow-tower export --pdf` with blocking checks; approved by the maintainer after three review rounds | `main` |

  **Merge order:** #168 → #170 → #172 bottom-up (retarget the next PR to `main` before deleting a merged base branch); #171 → #178 (retarget #178 to `main` first); #175 and #177 independently. Before merging #175, run `npm run e2e` on the maintainer's machine: on the test server 12 `towers.spec` cases time out (software WebGL), the same on `main`.
- **Squad cost on 2026-10-12:** #164 $0.33, #165 $0.06, #169 $0.11, #65 $0.89 (post each on its issue when it closes: `node tools/squad/cost.mjs <n>`).
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 FlashX reviews, DeepSeek 4.1 Flash audits. See [tools/squad](tools/squad/README.md) and the cost skill reference § Benchmark 2026-10-11.
- **Live:** the #97 two-computer test passed: the [command-center](examples/command-center) kit as a systemd service of a dedicated user, Tailscale Serve, two satellites on two computers lighting their towers together.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1–3 shipped; 4–8 on hold until the maintainer asks.

## Next, in order

1. Merge the PRs above (the maintainer), then a real tailnet test of #164 with the Mac and the Fedora (`connect` without a token, `share`, an edit syncing).
2. (done in #178) #176 squad runner
3. #69 tower names as an STT prompt
4. #143 split `docs/architecture.md` (docs-qa Q24; it grew again with #164/#165/#65)
5. #137 optional runtime files (schema)
6. #173 tower optimizer (example tower + skill + best practices doc) and #174 report studio (a tower for professional reports, built on #65's lessons): ask the maintainer for their priority
7. #147 Blender and Unreal benchmark categories
8. #85 privacy profiles · #93 admin · #94 alerts · #95 the rest of remote activity · #86 fan-out
9. #97 the docker compose and Caddy variants (systemd and Tailscale tested)
10. #5 live events with Pi (P1, needs a machine with Pi)
11. On hold: #129 voice 2 items 4–8, until the maintainer asks

## How work is done

The dev squad (`tools/squad`, PR #115): the lead (Claude) writes a task file per step and verifies, including rendered output (screenshots, `pdftoppm` pages) for UI and print work; the Claude Haiku coder writes the code, GLM reviews, DeepSeek checks security; the maintainer merges. Every commit is signed off (DCO), and each issue's squad cost (`tools/squad/cost.mjs`) is posted on it when it closes.

**Pace** (#169): reviews and security passes run with `SQUAD_PACE=relaxed` (one direct request with the code packed by `tools/squad/pack.mjs`: about a cent, a few minutes). `overnight` sends them through the Batch API (about half price, but it can wait for hours): only for unattended work. When the maintainer is waiting: the default tool loop, no batch, and faster models where the README table allows (`gpt-6-luna` for simple coding and non-sensitive security passes). The coder always runs the loop. [tools/squad § Pace](tools/squad/README.md#pace-how-fast-versus-how-cheap).

## Setup on a new machine

The history was rewritten before going public (2026-10-09): **re-clone**, do not pull into an older clone.

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower
npm install                        # Node >= 22.13 (node:sqlite for history)
npm run check                      # typecheck + tests
npm run dev                        # library of the examples at http://127.0.0.1:5317
npm run simulate -- dev-squad      # in a 2nd terminal: fake live events, sanity check
```

## Releasing

Bump `package.json` / `package-lock.json`, move `[Unreleased]` to a dated section in `CHANGELOG.md`, run `examples/release-auditor/scripts/gates.sh` (needs `uvx` and `gitleaks` on PATH) and a plain `npm run e2e`, write `reports/vX.Y.Z.md`, merge through a PR, then tag and publish the GitHub release with the CHANGELOG section as notes.
