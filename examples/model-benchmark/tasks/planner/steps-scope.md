---
id: steps-scope
category: planner
check: command
command: steps-scope.check.mjs
tools: read_file
files: fixtures/steps-scope/steps.sh.txt, fixtures/steps-scope/files-check.mjs.txt, fixtures/steps-scope/squad-local.ts.txt, fixtures/steps-scope/squad-scripts.test.ts.txt, fixtures/steps-scope/tree.txt
steps: 8
---
# Plan the steps.sh scope fix

From real work: Flow Tower issue #353, fixed by PR #354 (2026-10-31). The fixtures are the files as they were before the fix.

## Prompt

You are the lead of a coding squad. Plan the fix for this GitHub issue in the Flow Tower repository. Read the files you need with the read_file tool (`fixtures/steps-scope/tree.txt` lists the runner folder; the other fixtures are `tools/squad/steps.sh`, `tools/squad/files-check.mjs`, `src/cli/squad-local.ts` and `tests/squad-scripts.test.ts`). Each fixture file ends in `.txt`; plan with the real paths (without `.txt`).

Issue text:

> `tools/squad/steps.sh` runs a coder on each task file and commits after each green step. Three problems from field runs:
> 1. It commits changes that are not the step's: `git add -u` stages every tracked modification, so a maintainer's uncommitted local edits went into squad commits twice. The "changed nothing" guard has the same blind spot.
> 2. It reruns finished steps: running the folder again after a fix re-ran step 01, which changed nothing and went RED.
> 3. With no write dirs given, the coder gets the config's list, so a task whose `Files:` line names `examples/x/src/...` gets a coder that cannot edit those files.

Each step is done by a cheap coder model, so a step has at most 3 items, names every file it touches, and leaves the project's check green. Answer with one fenced js block and nothing else:

```js
export default {
  criteria: ['what must be true when the issue is fixed', ...],
  steps: [{ title: '...', items: ['...'], files: ['path/to/file', 'path/to/new-file+'] }, ...],
};
```

Mark a new file with a trailing `+`.

## Expected

The real fix kept the logic testable in a new runner file and had `steps.sh` call it. Its first coder run went red because the new file was missing from `RUNNER_FILES` in `src/cli/squad-local.ts` (the list `squad doctor` checks). A plan passes when it names `tools/squad/steps.sh` and at least one test file; **if it adds a new `tools/squad/*.mjs`, it must also name `src/cli/squad-local.ts`**. Steps have 1-3 items; at most 8 steps.
