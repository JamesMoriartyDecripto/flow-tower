# Flow Tower verification map

What a user can do in Flow Tower, one file per feature: how to get there, how to drive it, and what end state proves it. Read this index, then the file of the feature you changed.

## Baseline preconditions

- An instance launched by this run, as [SKILL.md](../SKILL.md) says, on the port you were given.
- `doctor --run <folder> --project <project>` prints only `ok` lines.
- Never an instance this run did not launch, and never port 5317.

## Driving conventions

- Each recipe starts from a fresh page on `<url>/?quality=eco`.
- A project id is what `doctor` lists: `sre-incident/sre-incident.tower.yaml` when the instance serves `examples/`.
- A node is `<layer id>.<node id>`, as the Inspector shows it under the node's name.
- Prefer a role, a label or a `data-` attribute over a position on screen.

## Proof and skip reporting

- A browser proof is a picture before and one after the action, with the app state read at both moments, and no console errors.
- An HTTP proof is the status and the body of each request.
- A CLI proof is the command, its output and the exit code the shell reported.
- Name each artifact after the feature id.
- Report an entry point you could not reach with what you tried and why. Do not report it as verified through another entry point.

## Feature entry contract

Each feature file has an H1, one paragraph on what the user sees, and four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with …`, `Gotchas`.

## Features

- [Open a tower from the library](./library-open.md) covers the library, the project card and the tower on screen.
- [Move through layers and views](./layer-navigation.md) covers the layer keys and the tower and map views.
- [Live events](./live-events.md) covers the events endpoint, the lit node and the live feed.
- [Validate a tower from the CLI](./validate-cli.md) covers `flow-tower validate` on a good and a broken tower.
