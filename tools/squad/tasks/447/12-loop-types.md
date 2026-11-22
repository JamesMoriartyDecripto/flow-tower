# 447-12: planJobs is declared with the task type it really carries

Rules: English only; edit only Files; write the minimum. Verify: `run typecheck`, then run test on tests/model-benchmark-squad-loop.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-loop.mjs (planJobs, and how main reads `j.task.id`), examples/model-benchmark/scripts/squad-loop.d.mts, tests/model-benchmark-squad-loop.test.ts.

Why: review of #455. squad-loop.d.mts declares `planJobs(opts: { tasks: string[] ... })` and `LoopJob.task: string`, but main passes the loaded task objects and reads `j.task.id`. The declaration says something the code does not do.

1. In squad-loop.d.mts make `planJobs` generic over the task: `planJobs<T>(opts: { tasks: T[]; models: string[]; runs: number }): Array<{ model: string; task: T; run: number }>`, and drop `LoopJob` if nothing else uses it. Change nothing in squad-loop.mjs.
2. Adjust tests/model-benchmark-squad-loop.test.ts only if typecheck asks for it.

Files: examples/model-benchmark/scripts/squad-loop.d.mts, tests/model-benchmark-squad-loop.test.ts (optional)
