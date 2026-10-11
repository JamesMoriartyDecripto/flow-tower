---
id: path-prefix
category: security
check: regex
rubric: true
tools: read_file
files: fixtures/serve-file.mjs
steps: 6
---
# Audit the file server's project boundary

From real work: Flow Tower serves files only from inside a tower's project (`src/core/loader.ts`, `projectOf`), because a tower can come from a cloned repository.

## Prompt

Security review of `fixtures/serve-file.mjs` (read it with the read_file tool). Threat model: the `requested` path comes from a tower file written by someone else (a cloned repository). The server runs on the user's laptop. A finding counts only if you can give a concrete input that reads a file the user did not mean to expose.

Report exploitable issues only, most severe first: the input, what it reads, and the fix.

## Expected

The planted defect: `abs.startsWith(root)` is a string prefix test. With the project at `/home/u/proj`, the path `../proj-secrets/key.pem` resolves to `/home/u/proj-secrets/key.pem`, which starts with `/home/u/proj`: a sibling folder sharing the prefix is readable. Fix: compare against `root + path.sep`, or use `path.relative` and reject results that start with `..` or are absolute. (Symlinks inside the project are a valid secondary finding.)

```regex
prefix|sibling|startsWith
path\.sep|relative\(|trailing (slash|separator)|\+ ?sep|root ?\+ ?['"`]/
```

Rubric (blind scorer, 0-10):
- 6 points: the prefix bypass with a concrete sibling-folder input.
- 2 points: a correct fix.
- 2 points: no invented issues (e.g. claiming `..` alone escapes: `resolve` plus the check stops plain `../../etc/passwd`). Symlinks earn no penalty.
