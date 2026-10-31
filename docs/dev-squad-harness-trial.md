# Dev Squad: repeatable host-harness trial

Tracking: #333 (acceptance), #334 (portable workflow), #332 (onboarding).
Implementation: #331, #335 and #337 are merged into main. Use an up-to-date checkout of main for new trials.
Historical results below name the older implementation commits actually tested; do not rewrite baseline evidence.

## Post-merge acceptance milestone

The operator-approved private GitHub trial reached a draft PR using the installed runner from `3af5ef6`:
actual issue → fresh install/doctor → nine specialist roles → code/tests/docs → independent tests → final-head
review/security → verifier → draft PR. All 22 tests passed independently, both passes approved the exact head,
and all roles completed. Ledger: nine calls, 21 steps, reported $0.008620, no unknown costs (lead cost excluded).
No merge or deletion was performed. Private links and local infrastructure are intentionally omitted.

The disposable repository had no GitHub Actions workflow: this proves local checks and draft-PR creation,
not GitHub CI execution. Existing user credentials were reused. Later doctor/argument fixes were tested in
the implementation suite. The maintainer-confirmed #333 scope is the current interactive lead, portable
Node/OpenRouter specialists, isolated acceptance tests and a draft PR (see the matrix below); the broader checklist
is not claimed. #328 and #320 retain separate scope.
The completion fixes in #337 do not guarantee that every future model call will finish within its limit.

## Current acceptance matrix (scoped #333, PR #344)

Maintainer-confirmed scope: the current interactive harness stays the lead; portable Node/OpenRouter specialists,
isolated tests and a draft PR. Automatic harness launch, discovery and session management remain in #320. The
Hermes remains unrecorded. The Claude Agent SDK reference backend and its five test files listed below were removed
in #355; their rows are kept as the record of what was tested at the time.

| Test file | Cases | Evidence type | What it covers |
|---|---|---|---|
| `tests/squad-acceptance.test.ts` (helper `tests/helpers/squad-acceptance-fixture.ts`) | 8 | Fixture: fresh git repo, HOME and config; trusted CLI init | init; doctor nonzero without key, ready with fake key; installed coder writes source/test; installed tester runs `node:test`; a wrong implementation gives a real nonzero exit in tool output |
| `tests/squad-live-acceptance.test.ts` | 3 | Fake model, loopback HTTP collector | all nine roles through installed runner, installed `ev.sh` and trusted CLI; payload schema and target resolution against the installed root/nested assets; towers validate 0/0; success and provider-error ends |
| `tests/squad-terminal-events.test.ts` | 10 | Subprocess fixtures | completion, provider, protocol, empty, truncated, step-cap, pre-start, offline and SIGTERM contracts; end attempted once after start |
| `tests/sdk-approval-events.test.ts` | 15 | Mocked GitHub events | fresh label application by an actor with current push permission; current label state and authorized comment recency; fail closed on unavailable evidence |
| `tests/sdk-pipeline.test.ts` | 17 | Real pipeline with mocked SDK-bound roles, Git and `gh` | explicit outcomes; plan approve/revise/timeout; escalation/hold; budget and provider failures |
| `tests/sdk-cli-status.test.ts` | 7 | Real main module with mocked delivery and `gh` | nonzero SDK CLI exit unless `pr_open` |
| `tests/sdk-quality-gates.test.ts` | 19 | Mocked provider, agents, prompts and JSON helper | incomplete or malformed verdicts stop; failed fixer stops; empty or unmet criteria, red or unknown suite, explicit gaps hold |
| `tests/sdk-security.test.ts` | 18 | Injected subprocess, stream and GitHub boundaries | credential filtering, stale reports, webhook byte/HMAC checks and authorized comment approvals |

The 18 existing SDK security regressions remain. The lead independently ran all eight boundary files: 97 passing
tests; the installed canonical and nested towers validate with 0 errors and 0 warnings. The full `npm run check`
also passed: 205 files, 2349 passing tests / 1 skipped, clean typecheck, with automatic fixtures on disk after
in-memory temporary storage hit its quota. Final-head review/security/verifier and PR #344 CI/gate remain separate
requirements; these results alone do not authorize a merge.

**Evidence type.** Every row above is fixture or mocked evidence: no real provider, real SDK run, GitHub call or
network reliability claim. The private GitHub trial provides real issue-to-draft-PR evidence. The historical
Pi/Claude Code/Codex trials below separately exercised real OpenRouter roles; their recorded counts remain intact.

**Recipe (repository checkout).**
1. Run `npm run check` in this checkout.
2. Run the focused files: `npm exec -- vitest run tests/squad-acceptance.test.ts tests/squad-live-acceptance.test.ts tests/squad-terminal-events.test.ts tests/sdk-approval-events.test.ts tests/sdk-pipeline.test.ts tests/sdk-cli-status.test.ts tests/sdk-quality-gates.test.ts`.
3. `TMPDIR` may point to a disk-backed temporary location, but only for automatic test fixtures. Keep tasks, logs
   and outputs in the ignored repository-local scratch folder. Do not create external task files or worktrees for
   this recipe, and do not move credentials into the project.

**Limits.** Not universal host parity; not a hostile-code sandbox; no enforced portable or global dollar cap; no
first-ever real key issuance. Role step bounds are not dollar caps. A diagnostic report that finishes with exit 0
means the role completed its report, not that project tests passed; the lead verifies and decides. Optional SDK
failed subcall costs can be incomplete in its pipeline journal, and its $15 metadata is a threshold after returned
stage costs, not proven portable or global enforcement. SIGKILL cannot emit the end event; the SIGTERM
`interrupted` ledger case uses a recorder, not real CLI cancellation. #328 still owns SDK reviewer alignment.

## What this tests

Your existing Pi, Claude Code, Codex, Hermes or other session is the **lead**. Specialists use the same
installed Node/OpenRouter runner. Keep these dimensions separate: a Claude-family specialist does not mean
Claude Code hosted the lead. No Claude SDK installation or Claude credentials are needed for the portable path.

This is a tiny local happy-path trial, not a claim that every tower capability is implemented. It does not test
unattended execution, a real PR/CI gate, adversarial code, enforced issue-level dollar limits, cancellation,
provider recovery or every possible project. Follow-up acceptance remains open in #333.

## Repeat from a new session

1. Open an up-to-date checkout of `main` (the merged feature branches have been removed). Read `AGENTS.md`,
   `CLAUDE.md`, `skills/flow-tower-squad/SKILL.md`, this file and the latest #333 comments. Record the commit
   tested, Node/git versions and actual lead harness/model. Do not overwrite existing worktrees or trial folders.
2. Create a **new disposable git repository** per harness. Configure a local test commit identity. Install:
   ```bash
   node <flow-tower-checkout>/bin/flow-tower.js squad init <trial> --check 'node --test'
   node <flow-tower-checkout>/bin/flow-tower.js squad doctor <trial>
   node <flow-tower-checkout>/bin/flow-tower.js validate <trial>/tools/squad/squad.tower.yaml --json
   ```
   Use the existing user-scoped OpenRouter key; never copy/print it. This checks fresh project installation,
   **not** first-ever user credential setup or a clean-machine install. Do not install SDK dependencies.
3. Inspect and commit installed files, then branch. The local base may be `master` or `main`; configure the
   actual base explicitly for diff/pack. This test has no remote: the Pi run created a local `origin/main` ref
   pointing to the installation commit for the existing pack defaults. That ref is **not a GitHub remote**.
4. Run the issue below through all nine specialist roles. Write task files yourself, pass necessary non-secret
   context, read each result, and approve the architect's plan before coding. Lead writes no implementation.
   Use separate task/result files per role. Small step bounds: triage 4, architect 4, researcher 3, coder 10,
   tester 5, doc-writer 6, verifier 5. Packed reviewer/security use one request each. A step bound is not a hard
   dollar cap: inspect cost after each call and stop on unexpected usage/provider failures.
5. Invoke from the trial repository:
   ```bash
   node tools/squad/run.mjs --role architect --task <plan-task> --issue 333 --steps 4
   node tools/squad/run.mjs --role doc-writer --write docs --task <docs-task> --issue 333 --steps 6
   ```
   Here `--issue 333` is only the local run's ledger label, not a GitHub issue lookup by `run.mjs`.
   When packing an offline review, use `pack.mjs --base <local-base> --brief <local-issue-file>` to supply
   issue context without a remote lookup; `--brief` is a pack option, not a runner option.
   Other roles use the same entry point. Keep configured models constant across host trials where available.
   Do not silently substitute unavailable models. Record retries, failures and any explicit fallback.
6. Independently inspect source, tests and documentation. Run `node --test` and `git diff --check` yourself.
   Commit final files before packing review/security; both must approve that exact clean head. Run verifier,
   confirm its claims against actual git/test output and check the tree remains clean. Changes require new
   evidence on the new head. Never treat a model statement alone as proof.
7. Save sanitized outputs, role models/steps/cost, actual assertions, kept/dropped findings and remaining gaps.
   Update #333 with a result for this harness. No external repository, draft PR, push or merge in this local
   trial. Ask before publication. Do not delete a trial with uncommitted/unpushed work without asking.

## Identical tiny issue

Create `src/slug.mjs` exporting `slug(text)`:

- Accept only primitive strings; otherwise throw `TypeError('slug() expects a string')`.
- Lowercase ASCII `A-Z` only. Do not globally lowercase Unicode.
- Replace each consecutive run outside ASCII `a-z0-9` with one hyphen; trim hyphens at both ends.
- Empty or punctuation-only input returns `''`. No transliteration, Unicode normalization, I/O or dependencies.
- Add `tests/slug.test.mjs` using `node:test` and `node:assert/strict`; `node --test` is the check command.
- Cover mixed case, whitespace/tabs/newlines, punctuation/hyphens, digits, empty input, accents, emoji,
  combining marks, invalid types, determinism and unchanged input. Primitive string identity is not meaningful.
- Expected examples: `Hello World → hello-world`, `café → caf`, `naïve façade → na-ve-fa-ade`,
  `Ångström → ngstr-m`, `a😀b → a-b`, `e` plus combining acute → `e`.
- Doc-writer creates `docs/slug.md` only, documenting the actual contract, usage and check command.

Suggested sequence: triage → architect → researcher checks assumptions → lead plan approval → coder →
tester → doc-writer → independent lead checks → final-commit reviewer/security → verifier → human handoff.
If a role discovers a defect, keep useful work, fix through the coder and rerun affected checks/reviews.

## Recorded Pi result

| Item | Evidence |
|---|---|
| Lead host | Existing interactive Pi session; manual command-based use of portable skill, not automatic skill discovery |
| Implementation tested | `dc4403cf03821ff52054c1733ed2df0256dcb548` |
| Environment | Node `v24.18.0`, git `2.56.0`; existing user-scoped OpenRouter credentials |
| Fresh install | init, doctor, installed tower validation passed (0 errors, 0 warnings) |
| Trial head | `f04679d10315cb9b810d13886bb8faa3ddcac58b` |
| Generated change | Only `src/slug.mjs`, `tests/slug.test.mjs`, `docs/slug.md`; 108 added lines |
| Independent tests | 3 top-level tests, 14 valid table cases, 6 invalid inputs, determinism/unchanged input; all passed |
| Review/security | Both approved trial head, no findings; default security model worked in this trial |
| Verifier | PASS; lead separately confirmed actual git head and clean tree (verifier's git interface could not establish hash) |
| Ledger | 9 specialist calls, 21 model steps, reported cost **$0.0073**, no unknown-cost runs; excludes interactive lead cost |

| Role | Model | Steps | Reported cost |
|---|---|---:|---:|
| triage | anthropic/claude-haiku-5.5 | 1 | $0.000782 |
| architect | z-ai/glm-5.3-flash | 2 | $0.000765 |
| researcher | z-ai/glm-5.3-flash | 3 | $0.000298 |
| coder | anthropic/claude-haiku-5.5 | 3 | $0.001548 |
| tester | anthropic/claude-haiku-5.5 | 2 | $0.001204 |
| doc-writer | anthropic/claude-haiku-5.5 | 3 | $0.001322 |
| reviewer | z-ai/glm-5.3-flash | 1 | $0.000442 |
| security | deepseek/deepseek-v4.1-flash | 1 | $0.000498 |
| verifier | z-ai/glm-5.3-flash | 5 | $0.000441 |

Observations: architect included a redundant primitive-string identity test; lead removed it before coding.
Tester suggested extra invalid-type/Unicode cases, but missed the existing `Ångström` case; lead checked the
actual table. A Kelvin-sign compatibility-folding regression case would be useful hardening, not a discovered
implementation defect. Verifier could inspect content/run checks but not independently establish the commit hash;
lead supplied that git evidence. `pack` emitted `no git remotes found` on this intentionally offline repository;
local commit packing still worked. No actual GitHub/CI gate or live-event delivery was tested.

## Recorded Claude Code result (2026-10-29)

| Item | Evidence |
|---|---|
| Lead host | Existing interactive Claude Code session (Opus 5.5) as lead, following the portable skill by hand; no Claude SDK |
| Implementation tested | `d2e2002d25d1c0776b45beab041550cb84f8be36` |
| Environment | Node `v24.18.0`, git `2.56.0`; existing user-scoped OpenRouter credentials |
| Fresh install | New disposable repo; init, doctor, installed towers validated (3 towers, 0 errors, 0 warnings) |
| Trial head | `6af619359ac3aedb454207c6b9c0f6f56b2502a3` (clean tree; only the three issue files added, 135 lines) |
| Independent tests | 4 top-level tests, 22 table cases, 13 invalid inputs; all passed. Mutants (`toLowerCase()`, `giu` flags, no `+`) each fail 1 test |
| Review/security | Both approved the trial head. Security: one low finding (slug not injective, may be `''`), quote verified, dropped: required by the issue, documented, no caller uses it as a key |
| Verifier | **Did not complete**: 2 runs, both `step cap` at 5 steps. Each wrote a correct PASS in prose next to tool calls but never called `finish`. Lead established the result from git/test output |
| Ledger | 10 specialist calls (one verifier retry), 29 steps, reported cost **$0.0105**, no unknown-cost runs; excludes lead cost. Per-role display values are rounded independently and need not sum to the unrounded ledger total. |

| Role | Model | Runs | Steps | Reported cost | Outcome |
|---|---|---:|---:|---:|---|
| triage | anthropic/claude-haiku-5.5 | 1 | 2 | $0.0013 | finish |
| architect | z-ai/glm-5.3-flash | 1 | 2 | $0.0010 | finish; plan approved unchanged |
| researcher | z-ai/glm-5.3-flash | 1 | 3 | $0.0004 | step cap; full report only in the log |
| coder | anthropic/claude-haiku-5.5 | 1 | 4 | $0.0018 | finish, check green |
| tester | anthropic/claude-haiku-5.5 | 1 | 2 | $0.0014 | finish |
| doc-writer | anthropic/claude-haiku-5.5 | 1 | 4 | $0.0017 | finish, `docs/slug.md` only |
| reviewer | z-ai/glm-5.3-flash | 1 | 1 | $0.0002 | approve, no findings |
| security | deepseek/deepseek-v4.1-flash | 1 | 1 | $0.0013 | approve, 1 low (dropped) |
| verifier | z-ai/glm-5.3-flash | 2 | 10 | $0.0015 | step cap twice, no `finish` |

Observations: triage flagged the Kelvin-sign `i`-flag trap up front, so the plan and tests pin it (the Pi gap is now a
case). Recipe deviation: the coder ran through `run.mjs --steps 10`, not `steps.sh`, which hard-codes `--steps 70`;
the lead committed after checking. The researcher's 3 confirmations were right (lead reproduced them with `node -e`),
with one wording slip (it said the non-`u` regex works on code points). The tester's two "gaps" were dropped: string
mutation is impossible, and its normalization test expected the wrong direction (`café -> caf` already rules out NFD).
**Runner gap:** GLM 5.3 Flash puts its final answer in assistant content alongside more tool calls and never calls
`finish`; at the cap, `run.mjs` prints only `step cap reached`, so the report is lost from stdout. Pi's verifier
finished in 5 steps, so this varies by run. `pack` again printed `no git remotes found`. No GitHub/CI gate, push or
live events tested.

## Recorded Codex result (2026-10-29)

| Item | Evidence |
|---|---|
| Lead host | This interactive Codex session, GPT-6-based agent; exact deployed model identifier unavailable. Portable skill followed manually, no Claude SDK |
| Implementation tested | `21fad558599c4a93b255c7c3ce29c597030593ea`; existing Pi and Claude Code commits retained |
| Environment | Node `v24.18.0`, git `2.56.0`; existing user-scoped OpenRouter credential reused without copying |
| Fresh install | New disposable local git repo; init passed, doctor passed outside sandbox, three installed towers at 0 errors/0 warnings |
| Trial base/head | Installation `f9a5e14`; final `89345daeac62aae24cb8eabad2767c780159e161`, independently checked clean before/after review and verifier |
| Generated change | Only `src/slug.mjs`, `tests/slug.test.mjs`, `docs/slug.md`; 161 added lines |
| Independent verification | Source/docs inspected; `node --test`: 12/12 pass; 22 direct valid examples, 9 invalid inputs, repeated-call determinism and unchanged-input assertion; `git diff --check` passed |
| Review/security | One packed request each, started together; both approved the exact final head with no findings |
| Verifier | PASS via explicit `finish` in 3/5 steps; lead independently confirmed head and clean tree |
| Ledger | 9 calls, 20 model steps, **$0.008795** reported cost ($0.0088 rounded); no unknown costs; lead cost excluded |

| Role | Model | Steps | Reported cost | Outcome |
|---|---|---:|---:|---|
| triage | anthropic/claude-haiku-5.5 | 4 | $0.001522 | finish |
| architect | z-ai/glm-5.3-flash | 2 | $0.000485 | finish |
| researcher | z-ai/glm-5.3-flash | 2 | $0.000568 | finish |
| coder | anthropic/claude-haiku-5.5 | 2 | $0.002022 | finish |
| tester | anthropic/claude-haiku-5.5 | 2 | $0.001009 | finish |
| doc-writer | anthropic/claude-haiku-5.5 | 3 | $0.001482 | finish |
| reviewer | z-ai/glm-5.3-flash | 1 | $0.000240 | finish |
| security | deepseek/deepseek-v4.1-flash | 1 | $0.001092 | finish |
| verifier | z-ai/glm-5.3-flash | 3 | $0.000375 | finish |

All nine roles completed. No step-cap exits, paid retries, provider errors or model substitutions occurred in
this run. This does not erase the Claude Code researcher/verifier failures or establish universal completion
reliability. The same configured models and role limits were used; task wording was freshly authored by this lead.

Kept the earlier Kelvin-sign regression. The lead corrected the architect's `Éclair -> -clair` example to
`clair` after trimming, and both reports' misleading single-pass wording. The researcher's Angstrom-sign
case-folding warning was overstated: it lowercases to non-ASCII `å`; Kelvin is the ASCII leakage case.
The lead reproduced Kelvin folding, `/iu` matching, edge trimming and combining-mark behavior in Node.
The tester found no defects. Its primitive-input immutability concern was dropped as a blocker: strings are
immutable and the requested before/after assertion exists. Malformed UTF-16 cases are optional hardening.
Eight invalid inputs assert exact error name/message; the String-wrapper case checks the constructor only;
BigInt is not asserted directly. The inspected common type guard rejects both with the required message.

Host restrictions were recorded separately from runner outcomes: the initial doctor and later `pack` failed
because sandboxed Node git subprocesses reported `EPERM`; both passed when rerun outside that sandbox.
The sandboxed independent test command printed only a file-level result; the lead reran outside the sandbox
and saved the actual 12 individual passing tests. Checkout `npm run check` initially hit sandbox `EROFS`
writing Vite's temporary config; outside the sandbox it passed typecheck and all 195 test files
(2210 tests passed, 1 skipped), including every example tower loading at 0 errors/0 warnings.
None of these were paid specialist retries.

Recipe details: explicit local base `main` in squad.json and `pack --base main --brief <local-issue>`;
no remote or fabricated remote ref. `--brief` supplies the identical issue without a GitHub remote lookup.
The coder used `run.mjs --steps 10`, with lead verification/commits, because `steps.sh` hard-codes 70.
`SQUAD_LEDGER` pointed to a separate local evidence file; `FLOW_TOWER_URL=http://127.0.0.1:1` kept live events
away from any running hub. All 18 installed runner code/script files were byte-compared to the checkout;
no runner changes. Separate task/result files, sanitized role logs, ledger, findings and independent test/git
outputs remain with the disposable local trial. It is retained because its commits have no remote backup.

No external repository, draft PR, push, CI gate, live-event delivery, first-time credential onboarding,
hostile-code isolation or enforced global dollar cap was tested. #333 remains open. Hermes is unrecorded.
