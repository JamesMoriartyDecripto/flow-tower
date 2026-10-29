---
id: coder-b
category: coder
check: rubric
steps: 5
---
# Coder: segment-aware root guard

Synthetic pilot coder task for case B. Acceptance is judged from the repository files; the offline check is separate.

## Prompt

You are the coder role of the dev squad. The case directory is the repository root.

Change `src/guard.mjs` so that `resolveInside(root, requested)` is a pure function that:

- returns the absolute path of a requested file under `root`, for example `resolveInside('/srv/files', 'docs/a.txt')` gives `/srv/files/docs/a.txt`; the request `.` gives the root itself;
- throws an `Error` whose message contains `escapes` when the result is outside `root`, including a sibling folder that only shares the name prefix (`/srv/files-private` next to `/srv/files`), a `..` escape, and an absolute path outside `root`.

Scope is lexical: work only on the path strings. Do not touch the file system, do not resolve symlinks and do not add any authorization logic.

Only `src/` may be written. Do not edit `tests/` or `docs/`. Use the node:path module. Keep the change minimal.

Edit the file with your edit tools, run the project check (command `check`, which is `node --test`) with the run tool, and fix any failure it shows. Then call finish with a short report: the files you changed and the result of the check.

## Expected

Rubric, judged from the repository files after the run:

- `resolveInside` is exported and stays pure: no file system calls, no symlink handling.
- Legitimate paths under `root` return the absolute path, and `.` returns the root itself.
- Sibling folders sharing the name prefix, `..` escapes and absolute paths outside `root` throw an `Error` whose message contains `escapes`.
- The check is segment-aware (for example `path.relative`), not a plain string-prefix test.
- Only `src/guard.mjs` changed; no test or doc file was edited.

The offline acceptance check (`checks/guard.check.mjs`) is run by the harness separately. It is not part of this rubric and the candidate never sees it.
