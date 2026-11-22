# Live events

A running agent posts events to Flow Tower. Each event lights the node it maps to and adds a row to the live feed. An event that maps to no node is counted and shown apart.

## Sub-features

- `events-post` accepts an event on `/api/events`.
- `events-feed` lists the events of the open tower in the live feed.
- `events-select` selects a node from its feed row.
- `events-unmapped` reports an event that matched no node.

## How to get to it (user POV)

- An agent hook or `flow-tower emit` posts to `/api/events`.
- Press `f` in a tower, or click `LIVE` in the top bar, to open the feed.
- Click a feed row to select its node.

## Driving it with verify.mjs

Preconditions:

- The project opens: see [library-open](./library-open.md).
- You know a node of that tower. For `sre-incident`, use `investigation.investigator`.

- **Post and follow.** Run `node $V events sre-incident --node investigation.investigator --name live-events`. It posts a start event, an error end event and one event for an agent that does not exist.
- **Check the answers.** In `live-events.json`, each of the three `posts` has `"status": 204` and `"bodyLength": 0`.
- **Check the feed and the node.** `"feedRows"` is `2` and `"selected"` is `investigation.investigator`.
- **Check the screen.** In `live-events.png` the feed header reads `LIVE · 2 · 1 ERR`, a line reads `1 matched no node · show`, and the Inspector on the right shows the node with the error message.

## Gotchas

- `/api/events` must answer 204 with an empty body. Claude Code hooks read a JSON body as a hook decision, so a 200 with a body is a defect even if the feed looks right.
- Three events give two feed rows. The feed opens on the `Tower` scope, and the unmapped event belongs to no tower. It appears in the `matched no node` line and under the `Library` scope.
- The instance lights only towers it serves. An event that names a tower outside `examples/` matches no node.
- Events stay in the instance until it stops. A second run of the drive on the same instance adds rows to the first run's. Launch a fresh instance when the row count matters.
