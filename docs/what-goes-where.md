# What goes where: layers, nodes, edges, nested towers

A tower answers one question: **how does work move through this system?** Each part of the file has one job. Put each thing in the place that answers it, and nowhere else.

| Part | Answers | One of these is… |
|---|---|---|
| **Layer** | *Which stage, or which concern?* | a horizontal plate: a group of nodes read left to right |
| **Node** | *Who or what does one step?* | one agent, process, tool, model, store, human, guard or hook |
| **Edge** | *What passes between two steps, and how?* | an arrow with a kind (`flow` `call` `spawn` `handoff` `return` `data`) |
| **Link** | *Same, but across layers* | an edge in top-level `links`, endpoints written `layer.node` |
| **Nested tower** | *What happens inside this one node?* | a separate `*.tower.yaml`, opened from a node with `tower:` |

## Layers

A layer is a **stage of the run** (intake, orchestration, specialists, quality) or a **supporting concern** that many stages use (tools, harness, memory, models). Layers go top to bottom: stages in the order a run goes through them first, then the supporting concerns. The [layer playbook](../skills/flow-tower/reference.md#layer-playbook-top--bottom-keep-only-what-exists) lists the usual ones.

- **Inside a layer, the flow reads left to right**: order the nodes as the run actually goes, entry on the left, outcome on the right.
- **3 to 10 nodes per layer.** Fewer than 3: merge it into a neighbour. More than ~12: split it by stage, or move a self-contained part into a nested tower.
- **One concern per layer.** "Review and deploy" is two layers if each has its own steps.
- **Keep only layers with real content.** No empty "Models" layer for a system that calls one model from one place: put the model on the agent.
- The title says what happens there (`Quality Loop`, `Tools & MCP`), the `description` says why it exists.

## Nodes

A node is **one thing that does one step**, at the level of detail a reader needs to follow the flow. Pick its `type` by what it is:

| Type | Use for |
|---|---|
| `entry` / `output` | Where a run starts (CLI, webhook, cron, chat) and where it ends (reply, PR, file, invoice) |
| `agent` | An LLM with its own prompt and loop (a subagent, a worker, an orchestrator) |
| `process` | Deterministic code: a script, a parser, a build step |
| `decision` | A branch, router or loop condition (pair it with a `[return]` edge for loops) |
| `tool` | A tool, an MCP server (one node per server or tool family) or an external API |
| `model` | An LLM model, when several agents share it and the routing matters |
| `memory` | State: files, databases, caches, vector stores, CLAUDE.md |
| `human` | An approval, review or input from a person |
| `guard` / `hook` | A policy, validator or permission rule / a lifecycle hook |

**Split** a node when its parts run at different times, on different runtimes, with different models or permissions, or when one part can fail and retry on its own. **Merge** nodes when they always run together and a reader would never ask about one without the other (three helper functions of one script are one `process`).

What belongs **on** a node (not in a separate node):

- **`agent:`** a reference to the `agents` registry. Model, prompt, tools, files, runtime and nested tower live on the agent and are inherited, so an agent used in two places is declared once.
- **`files`** the code and config that prove the step exists. They open in the viewer, so pick the ones a reader would open first.
- **`prompt`** a reference to the `prompts` registry or `{ file: … }`. Never paste long prompts inline.
- **`model`, `runtime`** where it thinks and where it runs.
- **`resources`** logs, scripts and dashboards for this step.
- **Operations** (`trigger`, `approval`, `budget`, `limits`, `fanout`, `data`, `evals`, `sla`, `sandbox`…) only when config or code shows them. They describe *this node*. Run-wide budgets go at the top level of the tower.
- **`label`** at most 18 characters (13 on a node that opens a nested tower: the badge takes the rest); `validate` warns above that. Details go in `description`.

## Edges and links

An edge says **what passes between two nodes and how**. Choose the kind by what the source does:

| Kind | The source… | Example |
|---|---|---|
| `flow` | finishes, then the target runs (default) | `triage -> planner` |
| `call` | calls the target and waits for the answer | agent → tool, agent → model |
| `spawn` | starts the target as a subagent | orchestrator → worker |
| `handoff` | gives up control to the target | router → specialist agent |
| `return` | sends a result back, or loops back | reviewer → coder `"changes requested"` |
| `data` | reads or writes the target | agent → memory, pipeline → vector store |

- **Label** what travels or when the edge is taken: `"plan.md"`, `"score < 8"`, `"max 3"`. Quote shorthand edges that have a label: `- "a -> b [call]: label"`.
- **Object form** for transport details: `protocol` (`mcp` `a2a` `http` `grpc` `webhook` `queue` `event` `stdio` `email` `manual`) when the wire matters, `async: true` when the source does not wait, and `group` when exactly one of several edges is taken.
- **Edges inside a layer** go in the layer's `edges`. **Edges between layers** go in top-level `links` as `layer.node`: an agent calling a tool in `Tools & MCP`, an orchestrator spawning a specialist, an agent writing to `Memory & Context`.
- **Loops are explicit**: a `decision` node plus a `[return]` edge labelled with the cap.
- **An orchestrator that runs every step** (a lead agent that spawns each worker and decides what comes next): draw `[spawn]` links from the lead to each step and `[return]` links from each step back to the `decision` node that reads its result. The decisions are the lead's, so they sit next to it.
- **Failures in a pipeline:** one `output` node for the failure (`Crash`, `Run failed`), with links from the steps whose failure a reader needs to see, labelled with what throws. Steps that fail the same uninteresting way are listed in that node's `description` (`any other throw: gh, JSON parse`) instead of one link each.
- Draw the edges a reader needs to follow the run. Do not connect everything that technically touches something else: one `[data]` link to the memory store beats one per file.

## Nested towers

A nested tower is the **inside of one node**: a self-contained subsystem with its own multi-step flow, which would crowd the parent if drawn there. Give a node (or its agent) `tower: towers/<name>.tower.yaml` when:

- it has **more than ~5 internal steps** of its own (a coder's plan → edit → test → self-review loop);
- it has its **own layers** (a frontend and a backend team, an SDI send-and-monitor cycle);
- it is **reused**: several nodes or projects open the same sub-tower;
- it is **owned or deployed separately** (a remote A2A agent, a vendor service).

Rules:

- **The parent keeps one node** for the subsystem: what goes in, what comes out, its operational limits. The sub-tower holds the steps inside. **Never draw the same steps in both.**
- The sub-tower starts with an `entry` that matches the parent node's input and ends with an `output` that matches what the parent's outgoing edges carry.
- Shared things (models, MCP servers, memory) appear in the sub-tower only where its steps use them. Declare its own `runtimes`, `agents` and `prompts`: a nested tower is a separate file with its own registries and `root`.
- Nested towers live in `towers/` next to the parent, and can nest further. Two levels are usually enough.
- A sub-tower in `towers/` sets `root: ..`, so its `files` and prompts resolve from the system root like the parent's.
- If a "subsystem" has only two or three steps, keep them as nodes in the parent instead.

## Services without agents

An HTTP API, a middleware chain or a set of workers is a tower too: the question is still how a request moves through it.

- **Layers:** one per surface (`Public API`, `Admin API`), plus the shared ones: ingress (TLS, auth, rate limits), data (stores, queues), jobs (cron, workers) and CI. A model call inside, if any, is one `agent` or `tool` node where it runs.
- **Order is mount order**, as the code registers it (`app.use`, `router.use`, route-level middleware), with one exception: something that wraps the response (a `res.json` interceptor, an output filter) runs **last**, although it is mounted early. Draw it just before the reply, and say where it is mounted in its `description`.
- **Many early exits:** every guard can reject. Draw one `output` node for the rejection and give it labelled edges (`401`, `403`, `429`), instead of an edge from every guard to the main reply.
- **The error branch** (the error middleware, the terminal handler, the error logger) is a `hook` with an edge to the rejection output: thrown errors go there, not through the happy path.
- **Per-item loops:** if a step runs for each item (an LLM call per row), the steps inside the loop sit between the `decision` and its `[return]` edge, not after it.

```yaml
- id: ingress
  title: Ingress
  nodes:
    - { id: request, type: entry, label: HTTP request }
    - { id: auth, type: guard, label: Verify token }
    - { id: limit, type: guard, label: Rate limit }
    - { id: handler, type: process, label: Route handler }
    - { id: filter, type: guard, label: Field filter, description: "Wraps res.json, so it runs last; mounted in app.ts before the routes." }
    - { id: reply, type: output, label: 2xx reply }
    - { id: errors, type: hook, label: Error handler }
    - { id: rejected, type: output, label: Error reply }
  edges:
    - request -> auth
    - auth -> limit
    - limit -> handler
    - handler -> filter
    - filter -> reply
    - "auth -> rejected: 401"
    - "limit -> rejected: 429"
    - "handler -> errors: throws"
    - "errors -> rejected: 500"
```

The `request` sub-tower of [`examples/db-api-playbook`](../examples/db-api-playbook/towers/request.tower.yaml) is a larger example: every check in order, and one Problem Details output with a labelled edge for each rejection. More towers without agents (study notes, playbooks) are in [examples § Beyond agents](../examples/README.md#beyond-agents-notes-and-playbooks).

## Do and don't

| Do | Don't |
|---|---|
| One tower per system, layers top to bottom, flow left to right | One layer per file or per class |
| One node per agent, tool family, store or human step | One node per function, or one node for "the backend" |
| Agents in the `agents:` registry, referenced from nodes | The same model / prompt / tools repeated on several nodes |
| Cross-layer relations in `links` | A copy of a node in another layer to draw an edge to it |
| Loops as `decision` + `[return]` with a cap | An unlabelled edge pointing backwards |
| A nested tower for a subsystem with its own flow | The subsystem's steps drawn both in the parent and in the sub-tower |
| Operations only where code or config shows them | Invented budgets, SLAs or eval scores |

## A small example

```yaml
# support.tower.yaml
name: Support Desk
agents:
  resolver: { name: Resolver, model: claude-sonnet-5-5, tools: [search_kb, create_ticket], tower: towers/resolver.tower.yaml }
layers:
  - id: intake
    title: Intake
    nodes:
      - { id: chat, type: entry, label: Chat widget, trigger: { kind: chat } }
      - { id: route, type: decision, label: Route by intent }
      - { id: handle, agent: resolver }
      - { id: human, type: human, label: Escalation desk }
      - { id: reply, type: output, label: Reply }
    edges:
      - chat -> route
      - "route -> handle [handoff]: known issue"
      - "route -> human [handoff]: refund > 200"
      - handle -> reply
  - id: tools
    title: Tools & Memory
    nodes:
      - { id: kb, type: memory, label: Help center }
      - { id: tickets, type: tool, label: Ticketing API }
links:
  - "intake.handle -> tools.kb [data]: search"
  - "intake.handle -> tools.tickets [call]: create"
```

The resolver is one node in the parent: what it does inside (look up the account, search, draft, check policy, retry) is its own tower in `towers/resolver.tower.yaml`, with an `entry` for the customer message and an `output` for the reply.
