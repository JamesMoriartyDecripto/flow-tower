# Live events

A running agent posts events to Flow Tower. Each event lights the node it maps to and adds a row to the live feed. An event that maps to no node is counted and shown apart.

## Sub-features

- `events-post` accepts an event on `/api/events`.
- `events-light` lights the node an event maps to, while its run is open.
- `events-feed` lists the events of the open tower in the live feed.
- `events-unmapped` reports an event that matched no node.

## How to get to it (user POV)

- An agent hook or `flow-tower emit` posts to `/api/events`.
- The node lights up in the tower, and its Inspector shows `state running`.
- Press `f` in a tower, or click `LIVE` in the top bar, to open the feed.

## Driving it with Playwright and HTTP

Preconditions:

- The project is open: see [library-open](./library-open.md).
- You know a node of that tower and how events reach it. In `sre-incident`, the node `investigation.investigator` has `match: ["agent:sre-investigator"]`, so an event with `agent: "sre-investigator"` reaches it without naming the node.

- **Before.** Select the node, then read its live state in the page: `useLive.getState().nodes.get('<tower id>#investigation.investigator')` through `liveState(node, Date.now())` from `/src/app/live.ts`. It is `idle`. Take a picture.
- **Post a start.** `POST <url>/api/events` with `{ "kind": "agent.start", "source": "<your tag>", "agent": "sre-investigator", "message": "<text>", "call": "<your tag>" }`. The answer is 204 with an empty body.
- **Stored.** `GET <url>/api/events` returns the event with `targets` holding `<tower id>#investigation.investigator`.
- **After.** The live state becomes `run`. The node is lit with a beam, a label reads `Investigator working`, and the Inspector says `state running (1)`. Take the same picture again.
- **Feed.** Press `f`. `.livefeed` shows a row for the event.
- **Close the run.** Post the same event with `"kind": "agent.end"` and `"status": "ok"`. The node goes to `done`.
- **Unmapped.** Post an event for an agent that does not exist. The feed shows `1 matched no node`, and the row appears under the `Library` scope, not under `Tower`.
- **Proof.** The two pictures, the live state at both moments, the status and body of each post, and the stored event with its target.

## Gotchas

- `/api/events` must answer 204 with an empty body. Claude Code hooks read a JSON body as a hook decision, so a 200 with a body is a defect even if the tower looks right.
- A start followed at once by an end leaves the node `idle`. Take the "after" picture while the run is open.
- The tower id depends on what the instance serves: `sre-incident/sre-incident.tower.yaml` when it serves `examples/`.
- Events stay in the instance until it stops. A second run of the drive adds to the first run's. Launch a fresh instance when a count matters.
- The instance lights only towers it serves.
