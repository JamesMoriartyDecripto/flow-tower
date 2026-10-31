---
id: temp-cleanup
category: planner
check: command
command: temp-cleanup.check.mjs
tools: read_file
files: fixtures/temp-cleanup/steps.sh.txt, fixtures/temp-cleanup/run.mjs.txt, fixtures/temp-cleanup/vitest.config.ts.txt, fixtures/temp-cleanup/squad-local.ts.txt, fixtures/temp-cleanup/tree.txt
steps: 8
---
# Plan the temp-file cleanup

From real work: Flow Tower issue #357, fixed by PR #358 (2026-10-31). The fixtures are the files as they were before the fix.

## Prompt

You are the lead of a coding squad. Plan the fix for this GitHub issue in the Flow Tower repository. Read the files you need with the read_file tool (`fixtures/temp-cleanup/tree.txt` lists `tools/squad/` and `tests/`; the other fixtures are `tools/squad/steps.sh`, `tools/squad/run.mjs`, `vitest.config.ts` and `src/cli/squad-local.ts`). Each fixture file ends in `.txt`; plan with the real paths (without `.txt`).

Issue text:

> Files and folders that are no longer needed fill the machine; a 3.8 GB `/tmp` hit its quota and commands failed.
> 1. Tests leave temp folders: 91 test files use `mkdtemp`, 24 never remove what they create; one copies 38 MB per run. 2205 leftover `/tmp/squad-*` folders.
> 2. `steps.sh` keeps its output folder (`mktemp -d .../squad-<issue>-XXXXXX`) forever, even after every step is green.
> 3. Runner logs never rotate: `tools/squad/<role>-<timestamp>.log`, 5087 files, one per run.

Each step is done by a cheap coder model, so a step has at most 3 items, names every file it touches, and leaves the project's check green. Answer with one fenced js block and nothing else:

```js
export default {
  criteria: ['what must be true when the issue is fixed', ...],
  steps: [{ title: '...', items: ['...'], files: ['path/to/file', 'path/to/new-file+'] }, ...],
};
```

Mark a new file with a trailing `+`.

## Expected

The real fix:
- gave each vitest run its own TMPDIR through a `globalSetup` file wired in `vitest.config.ts`, removed at the end, instead of editing 24 tests;
- made `steps.sh` delete its output on ALL GREEN;
- added a runner file that prunes old role logs, called from `run.mjs` and listed in `RUNNER_FILES`.

A plan passes when it covers the three areas:
- the test temp folders (`vitest.config.ts` or a new tests setup/temp helper);
- `tools/squad/steps.sh`;
- the logs (`tools/squad/run.mjs` or a new log/prune runner file).

Steps have 1-3 items; at most 8 steps.
