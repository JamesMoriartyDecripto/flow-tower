# 447-10: the drivers record only what they measured, and say so in their types

Rules: English only; edit only Files; write the minimum; comments explain why. Verify: run test on tests/model-benchmark-squad-roles.test.ts and tests/model-benchmark-squad-loop.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-roles.mjs, examples/model-benchmark/scripts/squad-loop.mjs, examples/model-benchmark/scripts/report.mjs (how it reads optional fields), tests/model-benchmark-squad-roles.test.ts, tests/model-benchmark-squad-loop.test.ts.

Why: review of #447. squad-loop.mjs writes `warm: false, firstOutputMs: null, retries: 0, completionTokens: 0, cachedFirstStep: 0, providers: []` on every line: the ledger has none of these, so `retries: 0` and `completionTokens: 0` are invented. The two tests import the scripts behind `@ts-expect-error`, against the project's untyped-mjs skill. In squad-roles.mjs, `rescore()` resolves the repo, the squad folder and the gate a second time; `readAt` refuses a path starting with `-` although the git argument always starts with `<head>:`.

1. squad-loop.mjs: drop those six fields from the line. Keep `effort: 'low'`: oneshot.mjs sends low for the loop too.
2. New squad-roles.d.mts and squad-loop.d.mts declaring every export; remove the two `@ts-expect-error` lines on those imports and the casts they forced.
3. squad-roles.mjs: `main` resolves `repo`, `squad` and the gate once and passes them to `rescore`; drop the `-` check in `readAt`; drop `exit(0)` at the end of `rescore`; `arg('rename', '')` without the second default.
4. Tests: in the rescore test the stored line has `pass: true`, so a rescore that copied the old score would fail. The loop dry-run test asserts the whole line `1 models × 1 tasks × 3 runs = 3 runs`. Paths in the tests come from `tmpdir()`, not `/tmp`. The squad-roles fixture is created in `beforeAll` and removed in `afterAll`.

Files: examples/model-benchmark/scripts/squad-roles.mjs, examples/model-benchmark/scripts/squad-loop.mjs, examples/model-benchmark/scripts/squad-roles.d.mts+, examples/model-benchmark/scripts/squad-loop.d.mts+, tests/model-benchmark-squad-roles.test.ts, tests/model-benchmark-squad-loop.test.ts
