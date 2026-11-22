# 462-02: a planned step names the files it only reads; criteria cover the change only

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tools/squad/runner-plan.mjs, tools/squad/runner-core.mjs lines 50-56 (PLAN_ASK), tests/squad-runner-plan.test.ts (describe parsePlan, describe taskFiles).
Verify: `run typecheck`, then `run test` on tests/squad-runner-plan.test.ts and tests/squad-runner-core.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.
Skills: tests

Why (#462): a plan step lists only the files it edits. A step that creates every file gets "Read nothing beyond the task.", although on #460 the page text had to come from the root README.md. The plan's criteria also carried the lead's own work (record the run, keep the PR a draft) into the coder's task.

Data shape: a step is `{ title, items, files, reads? }`; `reads` is optional, a list of existing relative paths the coder reads and does not edit.

1. tools/squad/runner-plan.mjs `problemOf`: when a step has `reads`, it must be an array of nonempty strings, each a path `badPath` accepts and not ending in `+` (a file to read already exists); the error names the step and the entry, as the files errors do. A step without `reads` is valid as today.
2. tools/squad/runner-plan.mjs `taskFiles`: the Read line lists the step's existing files, then its `reads`, then readFirst, each once. The `reads` never go into the Files line. Update the comment above taskFiles.
3. tools/squad/runner-core.mjs PLAN_ASK: the shape becomes `{"criteria": [strings], "steps": [{"title": "...", "items": [1 to 3 strings], "files": ["relative/path", "new/path+"], "reads": ["existing/path"]}]}`, and the text says: "reads" is optional and lists existing files the step must read but not edit (the source of its text or data); each criterion says what the finished change does, checkable in the code, never the runner's own work (checks, review, records, the pull request).
4. tests/squad-runner-plan.test.ts: parsePlan accepts a step with `reads` and refuses a `reads` entry that is absolute, has `..`, ends in `+`, or is not a string; taskFiles puts a step's `reads` in its Read line and not in its Files line, and a step whose files are all new but which has `reads` no longer says "Read nothing beyond the task.".

Files: tools/squad/runner-plan.mjs, tools/squad/runner-core.mjs, tests/squad-runner-plan.test.ts
