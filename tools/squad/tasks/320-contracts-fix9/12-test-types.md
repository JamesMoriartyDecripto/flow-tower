# 320-12: finish step 11 (keep that work)

Rules: English only; edit only Files; preserve existing work; change only the new test's typing. Verify: run `npm run typecheck`, then test on tests/squad-runner-fix-scope.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Step 11 is implemented in the working tree but not committed: keep all of it. The full check fails only on typecheck:
tests/squad-runner-fix-scope.test.ts(216,5): error TS2322: Type '(name: string, prompt: string, ...rest: unknown[]) => Promise<{ ok: boolean; text: string; }>' is not assignable to type '(name: string) => Promise<{ ok: boolean; text: string; }>'.
tests/squad-runner-fix-scope.test.ts(218,33): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
Fix only that new test's fake role function so it type-checks (for example give the fake deps object a looser type, as the other fakes in the file do). Do not change runner-core.mjs.
Files: tests/squad-runner-fix-scope.test.ts, tools/squad/runner-core.mjs (optional)
