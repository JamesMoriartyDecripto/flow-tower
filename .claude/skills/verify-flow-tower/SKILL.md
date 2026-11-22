---
name: verify-flow-tower
description: Launch an isolated Flow Tower instance, drive the real app as a user would, and keep proof (screenshots before and after, app state, HTTP answers, CLI output). Use this whenever you changed anything under src/, bin/ or examples/ and are about to say it works, before opening a pull request, and whenever someone asks to run, open, screenshot, test in a browser or check the real app, even if they do not say "verify". Also use it any time you need a running Flow Tower server, so that you never start one on port 5317 or with the developer's own user folder.
---

# Verify Flow Tower

Flow Tower is a web viewer, an HTTP events API and a CLI. To prove a change you need three things: an instance that is yours alone, a drive that does what a user does, and proof someone can look at later. The helper gives you the first. You write the second for the change you made. The standards below say what the third must hold.

The design is drawn in [verify-flow-tower.tower.yaml](verify-flow-tower.tower.yaml). Read [features/README.md](features/README.md) before you drive anything.

## Node

The helper and the CLI need Node 22.13 or newer. The `node` on PATH can be older: the helper then prints the version it needs and exits 2. Find a newer binary and use its full path: `ls ~/.nvm/versions/node/` on a Mac with nvm, `/opt/node22/bin/node` on the Linux test server.

```bash
N=<full path to node 22.13 or newer>
V=.claude/skills/verify-flow-tower/scripts/verify.mjs
```

## Launch

```bash
$N $V launch --port <port>
```

Use the port you were asked to use, or any free port from 5320 up. It prints `ready`, the run folder and the project count (39 with the checkout's examples), then the `doctor` and `stop` commands with the run folder filled in. Keep the run folder: every later command needs `--run <folder>`.

- **Never port 5317.** It is the default port, so a server there is the developer's or a live hub. `launch` refuses a port that is taken.
- **The instance is isolated.** It gets its own empty user folder, and every `FLOW_TOWER_*` variable of your shell is dropped, so it reads no personal config, uses no token and joins no hub. Start a server by hand and you lose all of that.
- **It serves the working tree.** Uncommitted edits are served too. The server loads `src/server/*` and `src/core/*` once: after you edit them, `stop` and `launch` again.
- **A CLI command needs no instance.** `validate` and the other commands run on their own.

## Doctor

```bash
$N $V doctor --run <folder> --project <project id or prefix>
```

Read-only. Run it before you drive and whenever something looks off. Each check prints `ok` or `FAIL`: the server process is alive, `/api/workspace` answers, the named project is served, the commit at launch is `HEAD`. The commit check does not see uncommitted edits.

## Drive

Write the drive for your change. A short Playwright script is enough, and the repository already has what you need:

- [e2e/fixtures.ts](../../../e2e/fixtures.ts) and [e2e/live.spec.ts](../../../e2e/live.spec.ts) show how to open a tower and read the app.
- Import Playwright from `node_modules/playwright/index.mjs` and launch `chromium` with `channel: 'chrome'`. The bundled Chromium does not run on macOS 13.
- The library shows one card per project: `[data-card="<project id>"]`. A project id is what `doctor` lists, such as `sre-incident/sre-incident.tower.yaml`.
- `window.__flowTower.store.getState()` gives `stack`, `library`, `selected`, `focusedLayer` and `view`. Wait for the hook: the app loads after the page.
- A node's live state comes from the module the scene draws from. In the page, `(await import('/src/app/live.ts'))` gives `useLive` and `liveState`. The key of a node is `<tower id>#<layer id>.<node id>`.
- WebGL renders in software. Wait several seconds after the tower opens before the first screenshot, or the picture is empty.

Each feature file has the selectors, the keys and the end state for one feature.

## Proof

Save everything under `<run folder>/evidence/`. `stop` keeps that folder. It is in the system temp folder, so copy what must last.

- **Show the behaviour that was asked about.** For "the node lights up", that is the node in state `run` on screen, not a row in the feed.
- **Record before and after.** The same view of the same thing, once before the action and once after, with the state read from the app next to each picture.
- **Act as a user does.** Click, press a key, post over HTTP, run the CLI. Reading the store is fine. Setting it to skip a step is not.
- **Check the side effect next to what is visible.** For an event, the HTTP status and the body. For the CLI, the exit code, captured by the shell and saved with the output.
- **Look at each screenshot.** A green exit code does not show a broken layout or a picture taken too early.
- **Keep the script.** Someone can then run the proof again.
- **Say what you did not check.**

## Stop

```bash
$N $V stop --run <folder>
```

It stops the server by the process id recorded at launch, after checking that the process is still this run's server, and removes the run's user folder and the Vite cache the server wrote for its port. Then check that nothing listens on the port: the process can take a moment to leave the process table. Close the browser your script opened.

- Never stop a server by process name. A pattern also matches the shell that runs it.
- Run `stop` after a failed drive too.

To keep the feature map true as the app changes, run `/pstack:maintain-verification-skill`.
