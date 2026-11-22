# Flow Tower verification map

This folder is the maintained source for verifying what a user can do in Flow Tower. Read this index before you drive the app, then follow the file of the feature you changed.

## Baseline preconditions

- An instance launched by this run: `node $V launch --port 5327`, where `V=.claude/skills/verify-flow-tower/scripts/verify.mjs`.
- `node $V doctor` prints only `ok` lines and lists 39 projects.
- Never drive an instance this run did not launch, and never port 5317.

## Driving conventions

- Start every recipe from a fresh `open`: each drive opens its own browser page.
- Name the evidence after the feature id with `--name`.
- A project argument is an id from `doctor`, or a prefix of one. `sre-incident` means `sre-incident/sre-incident.tower.yaml`.
- A node is `<layer id>.<node id>`, as the Inspector shows it under the node's name.

## Proof and skip reporting

- A browser proof is the PNG and the JSON of the drive, with `consoleErrors` empty.
- An HTTP proof is the status and the body length of each request.
- A CLI proof is the command, stdout, stderr and the exit code.
- Record the feature id and the entry point used with each artifact.
- Report an entry point you could not reach with the command you tried and the reason. Do not report it as verified through another entry point.

## Feature entry contract

Each feature file has an H1, one paragraph on what the user sees, and four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.mjs`, `Gotchas`.

## Features

- [Open a tower from the library](./library-open.md) covers the library, the project card and the tower on screen.
- [Move through layers and views](./layer-navigation.md) covers the layer keys and the tower and map views.
- [Live events](./live-events.md) covers the events endpoint, the live feed and the lit node.
- [Validate a tower from the CLI](./validate-cli.md) covers `flow-tower validate` on a good and a broken tower.
