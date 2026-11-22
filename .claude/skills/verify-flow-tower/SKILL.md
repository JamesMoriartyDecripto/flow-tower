---
name: verify-flow-tower
description: Launch an isolated Flow Tower instance, drive the web viewer, the events API and the CLI as a user would, and keep evidence. Use to prove a change to the app works before saying it is done, or when a run needs a real instance that is not the developer's own server.
---

# Verify Flow Tower

Flow Tower is a web viewer (the primary surface), an HTTP events API and a CLI. This skill starts a real instance in isolation, drives one feature, and keeps proof. Every command below is one helper script:

```bash
V=.claude/skills/verify-flow-tower/scripts/verify.mjs
node $V --help
```

Run it from the repository root with Node 22.13 or newer. If `node -v` is older, the script says so and exits 2: use a newer binary by its full path.

Read [features/README.md](features/README.md) before you drive anything. It lists the features and the proof each one needs.

## Launch

```bash
node $V launch --port 5327
```

It prints `ready http://127.0.0.1:5327`, the run folder and the project count (39 with the checkout's examples), then leaves the server running. Ready means `/api/workspace` answers 200 with projects, which takes about 3 seconds on a laptop.

- **Never use port 5317.** It is the default port, so a server there belongs to the developer or to a live hub. `launch` refuses a port that is taken. Pick another with `--port`.
- **The instance is isolated.** It serves `examples/` with its own empty user folder (`FLOW_TOWER_HOME` in the run folder), so it reads no personal config and joins no hub.
- **Two runs can live side by side** on different ports. Each has its own run folder under the system temp folder, in `flow-tower-verify/`. The file `flow-tower-verify/current` names the last one launched. Every other command takes `--run <dir>` to pick a run.
- **A new instance after a code change.** The server loads `src/server/*` and `src/core/*` once. After you edit them, `stop` and `launch` again.

## Doctor

```bash
node $V doctor
```

Read-only. Run it first whenever something looks off. It prints one `ok` or `FAIL` line per check and exits 1 on any `FAIL`:

- `run.json` is readable.
- The recorded PID is alive.
- `/api/workspace` answers 200. The line lists the project count and the first five project ids.
- The commit the instance was launched at is the checkout's `HEAD`. A `FAIL commit` means the instance runs older code: `stop` and `launch` again.

## Drive

Three drives cover the three surfaces. Each one exercises the user path and writes its evidence.

```bash
node $V open sre-incident --keys PageDown,PageDown,m --name library-open
node $V events sre-incident --node investigation.investigator --name live-events
node $V validate examples/starters --name validate-starters
```

- **`open <project>`** opens the library in headless Chrome, clicks the project card (`[data-card="<id>"]`), waits for the tower, then presses each key of `--keys`. `<project>` is a project id or a prefix of one. It records the app state after each step, read from `window.__flowTower.store`.
- **`events <project> --node <layer.node>`** opens the project, opens the live feed with `f`, posts three events to `/api/events`, clicks the feed row of the error event, and checks that the node is selected. Each post must answer 204 with an empty body.
- **`validate <path>`** runs `flow-tower validate <path> --json` and keeps the command, the exit code and both output streams. It needs a run folder, not a running server.

A drive that fails its own expectation prints `FAIL <what>` and exits 1. It still writes the evidence it has, and the JSON's `error` field holds the full error, with Playwright's call log for a browser failure.

A known failure of the drive, not yet explained: the first `open` after a `launch` timed out on the card click 2 times in 17. The library was on screen, and Playwright's call log ended with `waiting for element to be visible, enabled and stable`: the card was found and never settled. Later drives on the same instance passed. If it happens, keep the JSON, run `doctor`, and run the drive once more. Report it as a failure of the drive, with the `error` text, not as a defect of the feature you are verifying.

For a path these drives do not cover, use the repository's Playwright specs in `e2e/` against the instance you launched. Do not point them at port 5317.

## Evidence

Evidence goes to `<run>/evidence/`, named by `--name`. Each drive prints the files it wrote.

| Drive | Files | What they prove |
|---|---|---|
| `open` | `<name>.png`, `<name>.json` | the screen, and the app state after the click and after each key |
| `events` | `<name>.png`, `<name>.json` | the HTTP status and body length of each post, the feed row count, the selected node |
| `validate` | `<name>.json` | the command, its exit code, stdout and stderr |

Proof standards:

- Drive the user path: the card click, the key, the HTTP post. Do not set the store directly.
- Keep the action and the resulting state, not only the last screen. The `steps` list in the JSON pairs them.
- Check the side effect next to what is visible. For an event, that is the 204 with an empty body and the selected node, not only a feed row.
- Look at the screenshot. A green exit code does not show a broken layout.
- `consoleErrors` in the JSON must be empty. If it is not, report its content.

## Cleanup

```bash
node $V stop
```

It stops the server by the PID recorded at launch, waits until the port stops answering, and removes the run's user folder. It prints where the evidence is. The evidence and `server.log` stay in the run folder.

- Never stop a server by process name. A pattern also matches the shell that runs it.
- After `stop`, `doctor` reports `FAIL pid` and `FAIL workspace`. That is the expected state of a stopped run.
- Run `stop` after a failed drive too, so no server keeps the port.

## Helpers

`scripts/verify.mjs` is the only helper. `node $V --help` lists its commands: `launch`, `doctor`, `open`, `events`, `validate`, `stop`.

To keep the feature map true as the app changes, run `/pstack:maintain-verification-skill`.
