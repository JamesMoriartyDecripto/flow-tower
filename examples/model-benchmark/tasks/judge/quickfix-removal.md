---
id: quickfix-removal
category: judge
check: command
command: quickfix-removal.check.mjs
tools: read_file
files: fixtures/quickfix-removal.patch
steps: 6
---
# Keep or drop the review findings: quick-fix route removal

From real work: Flow Tower issue #347, review round 1 (2026-10-30). The reviewer and security models ran on the packed diff of commit 3b36cb6; the lead checked each finding in the code and kept or dropped it. Finding texts are condensed from the real outputs.

## Prompt

You are the lead of a coding squad. A pull request removed the deprecated quick-fix route from a pipeline, so every issue now goes through a plan, review and verification. Its brief said: "Check that no path skips the plan or the gates, that the sensitive-area risk rule still applies, and that tests cover the full path, failures and budget."

Read the diff with the read_file tool: `fixtures/quickfix-removal.patch`. Then decide, for each finding below, **keep** (a real defect that this pull request introduces, or makes reachable or worse even on a line it does not touch: it becomes a fix step now) or **drop** (wrong, harmless, already handled, or a pre-existing defect this pull request does not affect: to be tracked in a separate issue).

- **R1** (reviewer) `examples/dev-squad/src/pipeline.ts`, `const prNumber = Number(text(pr).match(/\/pull\/(\d+)/)?.[1]);`: prNumber is NaN when open_pr prints no `/pull/<n>` URL, so the merge approval request gets `pr: NaN`.
- **R2** (reviewer) `tests/sdk-pipeline.test.ts`: no test covers the sensitive-area risk rule (`applyPolicy` forcing risk high, hence a plan sign-off), which the brief says must still apply; the tests mock triage entirely.
- **S1** (security, high) `examples/dev-squad/src/triage.ts`, ``const touchesSensitive = sensitive.test(`${issue.title} ${t.areas.join(' ')}`);``: the sensitive-area override reads only the title and the model-chosen areas, never the body. An issue titled "Fix typo" whose body changes the auth token check can come back with `areas: ['web']`, keep risk low and skip the human sign-off, now that every issue takes the full path.
- **S2** (security, medium) `examples/dev-squad/src/config.ts` `sdkEnv()`: it spreads the whole process environment into every agent subprocess, so each agent inherits every secret of the squad process.
- **S3** (security, medium) `examples/dev-squad/src/pipeline.ts` `createWorktree`: the worktree path and branch are keyed only on the issue number, so two repositories with the same issue number collide.
- **S4** (security, low) `examples/dev-squad/src/config.ts`: the fallback worktree root is a predictable path under `/tmp`.
- **S5** (security, low) `examples/dev-squad/src/triage.ts`: only the issue body is wrapped in `untrusted()`; the title is interpolated into the prompt raw.

Answer with one fenced js block and nothing else: `export default { R1: 'keep' | 'drop', R2: ..., S1: ..., S2: ..., S3: ..., S4: ..., S5: ... };`

## Expected

The lead's decisions on the day:
- **R2 and S1 kept.** S1 is a real hole made worse by this pull request; R2 is the test the brief asked for.
- **R1, S2, S3, S4 and S5 dropped.** Those lines are untouched by the diff (pre-existing); they went to a follow-up issue (#350).

S1 is critical: dropping it would have merged the hole. Passing needs S1 kept and at least 6 of 7 decisions matching.
