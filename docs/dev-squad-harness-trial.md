# Dev Squad: repeatable host-harness trial

Tracking: #333 (acceptance), #334 (portable workflow), #332 (onboarding).
Implementation: draft PR #335, stacked on #331. Do not test the older runner from main.

## What this tests

Your existing Pi, Claude Code, Codex, Hermes or other session is the **lead**. Specialists use the same
installed Node/OpenRouter runner. Keep these dimensions separate: a Claude-family specialist does not mean
Claude Code hosted the lead. No Claude SDK installation or Claude credentials are needed for the portable path.

This is a tiny local happy-path trial, not a claim that every tower capability is implemented. It does not test
unattended execution, a real PR/CI gate, adversarial code, enforced issue-level dollar limits, cancellation,
provider recovery or every possible project. Follow-up acceptance remains open in #333.

## Repeat from a new session

1. Open the checkout of `feat/332-runnable-dev-squad`, not the unchanged main checkout. Read `AGENTS.md`,
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

Claude Code, Codex and Hermes trials are **not yet recorded**. Do not mark them passed based on the Pi result.
