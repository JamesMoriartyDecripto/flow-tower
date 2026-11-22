# Validate a tower from the CLI

`flow-tower validate` reads tower files and reports errors and warnings without starting the viewer. Authors and CI use it before a tower is shared.

## Sub-features

- `validate-ok` reports a clean folder.
- `validate-errors` reports a broken tower and exits with a failure code.

## How to get to it (user POV)

- Run `node bin/flow-tower.js validate <file.tower.yaml | dir> --json` in a terminal.

## Driving it with verify.mjs

Preconditions:

- A run folder exists (`launch` made one). The server does not need to be running.

- **A clean folder.** Run `node $V validate examples/starters --name validate-ok`. The command exits 0. In `validate-ok.json`, `"exit"` is `0` and `stdout` parses as JSON with `"ok": true` and four projects.
- **A broken tower.** Write a tower with an edge to a node that does not exist, in a folder outside the repository, and run `node $V validate <that folder> --name validate-errors`. The drive prints `FAIL validate exited 1` and exits 1. In the JSON, `"exit"` is `1` and `stdout` has `"ok": false` with the issue listed.

## Gotchas

- A `FAIL` from this drive on a broken tower is the proof, not a problem with the drive. Report the exit code and the issue text.
- Keep scratch towers out of `examples/`. The examples test fails on any file there that git ignores or that does not validate.
- `--json` is always passed. The human-readable output is not captured by this drive.
