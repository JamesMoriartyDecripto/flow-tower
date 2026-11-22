# 447-04: rescore stored answers against a changed case file

Rules: English only; edit only Files; write the minimum; plain functions; comments explain why; files under ~400 lines. Never rewrite or empty an existing test file: append cases. Verify: run test on tests/model-benchmark-squad-roles.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read examples/model-benchmark/scripts/squad-roles.mjs (runJob builds the line: outcome and answer are stored; report reads the file), examples/model-benchmark/scripts/squad-score.mjs (scoreRun).

Why: issue #447. After the first run, two case keys changed on evidence from the code (a "clean" head held two real defects). Every stored line keeps its `outcome` and `answer`, so the runs can be scored again without paying for them.

1. In examples/model-benchmark/scripts/squad-roles.mjs add `node scripts/squad-roles.mjs --rescore <in.jsonl> --cases <cases.json> --out <out.jsonl> [--squad <tools/squad dir>] [--repo <git repo>] [--rename old=new,old2=new2]`:
   - Handled in `main` before the run mode, like `--report`. `--out` must differ from `--rescore` (else exit 2 with a message) and is overwritten.
   - For each input line: the case id is `line.case`, replaced through `--rename` when listed. A line whose case id is not in the case file is dropped and counted.
   - Build the new line with an exported pure function `rescoreLine(line, kase, deps)` where `deps` is `{ parseVerdict, checkFinding, readFile }`: it returns the old line with `case: kase.id`, `kind: kase.kind` and the fields of `scoreRun({ kase, outcome: line.outcome, answer: line.answer, ...deps })` replacing the old score fields. Every other field (ts, role, model, run, seconds, outcome, cost, tokens, answer) is kept as it was.
   - `readFile` is the existing `readAt(repo, kase.head)`; the gate functions come from `<squad>/gate.mjs` as in the run mode.
   - Print `rescored N lines, dropped M, pass changed on K` and exit 0.
2. Append to tests/model-benchmark-squad-roles.test.ts: `rescoreLine` on a stored line whose answer is `{"verdict":"changes","findings":[{"severity":"high","file":"a.sh:1","quote":"mapfile -t x","what":"mapfile is missing in bash 3.2","why":"w","fix":"f"}]}`: with a clean case it gives `pass: false`; with a defect case whose key is `{ id: 'M2', file: 'a.sh', pattern: 'mapfile' }` it gives `pass: true`, `keys: ['M2']`, `kind: 'defect'`, the new case id, and keeps `cost`, `seconds` and `answer`. Use the real parseVerdict and checkFinding from tools/squad/gate.mjs and a `readFile` returning `'mapfile -t x\n'`.

Continuation: both files already hold a finished first attempt. Its full check failed only on an unrelated 5 s timeout in tests/cli.test.ts while the machine was busy. Read the two files, run typecheck and the test file, fix only what is wrong, and finish.

Files: examples/model-benchmark/scripts/squad-roles.mjs, tests/model-benchmark-squad-roles.test.ts
