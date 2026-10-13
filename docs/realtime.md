# Live events

How to wire agents to the local server (sources, `emit`, OpenTelemetry, history, matching). The one home of
**live events setup**. Other machines and hubs: [command-center.md](command-center.md).

Flow Tower can show what your agents are doing **right now**:
- active nodes pulse and send a light beam up through the tower;
- errors flash red;
- the **Live feed** (click **LIVE** in the top bar) lists every event. Click an event to jump to its node. Its **Tower** scope shows the tower on screen and its sub-towers, **Library** every project.

Everything stays on your machine. Agents post events to the local server, and the server pushes them to the browser. (The only outbound call Flow Tower makes is a daily update check against GitHub releases; see the README, *Privacy and updates*.)

```
agent / hook / script ──POST /api/events──▶ flow-tower (127.0.0.1) ──websocket──▶ tower
```

Try it without wiring anything:

```bash
npm run dev                        # terminal 1
npm run simulate -- game-studio    # terminal 2: 3 parallel walkers replay a plausible run
```

## Sources

**One command wires them all:** `flow-tower hooks install` finds Claude Code, Codex, Pi and Hermes on this machine
and merges Flow Tower's entries into each one's config, on the port of the library running now (else `--port N`,
else 5317). It keeps every hook of your own, backs a changed file up as `<file>.flow-tower.bak`, and a second run
changes nothing. `--target <harness>` picks one, `--project` writes the project's config instead of your user one (Hermes has no project config: skipped),
`--dry-run` only prints. `flow-tower hooks status` shows where they are wired and whether the port matches the running
library; `flow-tower hooks uninstall` removes only Flow Tower's entries. The table below is what it installs, for
reading or doing it by hand.

| Source | How | Ready-made config |
|---|---|---|
| **Claude Code** | Native `http` hooks (plus one `command` hook for SessionStart) | [`integrations/claude-code/settings.json`](../integrations/claude-code/settings.json): merge into `.claude/settings.json` |
| **Claude Agent SDK** | Hook callbacks that forward to the endpoint | [`integrations/agent-sdk/flow-tower-hooks.ts`](../integrations/agent-sdk/flow-tower-hooks.ts) |
| **Pi** (coding agent) | Extension listening to `pi.on(...)` events | [`integrations/pi/flow-tower.ts`](../integrations/pi/flow-tower.ts): copy to `~/.pi/agent/extensions/` |
| **Codex** (OpenAI) | Command hooks (`flow-tower emit`), `codex exec --json` stream, or legacy `notify` | [`integrations/codex/`](../integrations/codex): `hooks.json` to `~/.codex/hooks.json`, or `notify` from `config.toml` |
| **Hermes Agent** | Native outbound webhooks | [`integrations/hermes/config.yaml`](../integrations/hermes/config.yaml): merge into `~/.hermes/config.yaml` |
| Shell hooks, cron jobs, CI, your own loops | `flow-tower emit` or plain HTTP | see below |

Notes:
- **Claude Code:** the SessionStart hook is a `command` hook that runs `flow-tower emit`. `flow-tower hooks install` writes the full `node …/bin/flow-tower.js` path, so it needs no `npm link`; by hand, put the CLI on your `PATH` with `npm link` in your checkout (never `npx flow-tower`: the name is not published on npm, so npx would fetch whatever package claims it). Without it only the session start is missed.
- **Claude Code:** the endpoint answers `204` with an empty body, because Claude Code reads a JSON response body as a hook decision. If the server is down, the hook fails open: the session runs normally and Claude Code only prints a non-blocking "hook failed: ECONNREFUSED" line (checked with a real session).
- **Claude Code subagents:** an `Agent` (formerly `Task`) call starts the subagent and `SubagentStop` ends it. Background subagents (the default) return from the call at once (`status: async_launched`), so their node stays lit until they really stop. Every event a subagent produces carries its **`role`**: the `description` of the `Agent` call that launched it. Several subagents of the same type (`general-purpose`) therefore map to different nodes with `match: ["role:*security*"]`. Resuming one with `SendMessage` starts it again.
- **Claude Code main session:** its events have `agent: main` (`match: ["agent:main"]`). Turns that Claude Code injects (a background subagent reporting back, scheduled tasks, messages from other sessions) arrive through `UserPromptSubmit` but become `log` events with a short summary, not user prompts.
- **Pi:** `pi --mode json "…" | flow-tower emit --source pi` also works for one-off runs: `emit` carries the session id of Pi's first `session` line to every later line, and drops the streaming chunks. Checked with a real Pi 0.73.1 run (extension and JSON mode): session, prompt, tool pairs with errors, model, tokens and cost per turn.
- **Codex:** approve the hooks once with `/hooks`; hooks in a repo's `.codex/` only run in trusted projects. Hosted tools (web search) do not fire hooks. Tool names match across sources (`Bash`, `apply_patch`, `mcp__<server>__<tool>`); failures are inferred from the tool response (non-zero `exit_code`, `isError`), since hooks carry no status and no tokens.
- **Codex one-off runs:** `codex exec --json "…" | flow-tower emit --source codex` adds token usage per turn (input + output) and `spawn_agent`/`close_agent` subagents. `emit` carries the `thread_id` of the `thread.started` line to every later line, so the whole run is one session.
- **Codex `notify`:** the legacy hook passes its JSON as the last argument, not stdin, and only reports turn ends. Use it where hooks are unavailable, not together with them.
- **Hermes:** keep it observe-only, with no `fail_closed`. Otherwise a stopped flow-tower would block Hermes' tools.

## Same tower, any harness

Teammates on one hub may use different harnesses: the same work must light the same nodes. `tests/harness-parity.test.ts`
replays one small session (prompt, a tool that succeeds, one that fails, a subagent, usage) in each harness's real
payload shape and checks the normalised events; a tool rule such as `match: ["tool:bash"]` lands every harness's shell
call on one node. What a harness cannot send is declared there, with the reason:

| Harness | Session, prompt, tool pairs, errors | Subagents | Tokens | Cost |
|---|---|---|---|---|
| Claude Code (hooks) | yes | yes (`role`) | via OpenTelemetry | via OpenTelemetry |
| Agent SDK (TypeScript hooks) | yes | yes | no hook carries them | no |
| Codex (hooks) | yes | yes | `codex exec --json` or OpenTelemetry | OpenTelemetry |
| Pi (extension or `--mode json`) | yes | no subagent events | yes, per turn | yes |
| Hermes (webhooks) | session and tools; no prompt event | yes | yes | no |
| `emit` / plain HTTP | what you send | what you send | what you send | what you send |

## Any other agent

`POST http://127.0.0.1:5317/api/events` with `Content-Type: application/json` and one event or an array of events:

```json
{ "kind": "tool.start", "source": "my-loop", "agent": "researcher", "tool": "web_search", "message": "query: SCORM cmi5" }
```

| Field | Meaning |
|---|---|
| `kind` | `session.start` `session.end` `prompt` `agent.start` `agent.end` `tool.start` `tool.end` `error` `log` `usage` |
| `source` | Free text, e.g. `cron`, `github-actions`, `my-loop` |
| `agent`, `tool` | Names used to find the node (see matching) |
| `node` | Explicit target `layer.node`; skips matching |
| `tower` | Restrict matching to towers whose id or name contains this |
| `status` | `ok` or `error` |
| `message`, `session`, `call`, `parent`, `model`, `tokens`, `cost_usd`, `duration_ms`, `ts` | Optional details. `call` pairs a start with its end. `ts` is epoch ms. |

From a shell script (`flow-tower` is not on npm yet: run `npm link` in your checkout, or call `node <flow-tower>/bin/flow-tower.js`):

```bash
flow-tower emit --kind agent.start --agent nightly-report -m "building report"
flow-tower emit --kind error --node build.package -m "exit 1"
```

Without `--url`, `emit` posts to the server this user folder started (any port: the running server records it in
`local-server.json`), else to `http://127.0.0.1:5317`. `npm run simulate` does the same.

`emit` always exits 0 and gives up after 1.5 s, so it never breaks the thing it observes.

## Tokens and cost (OpenTelemetry)

Hooks say what agents do, not what it costs. Token counts and cost come from OpenTelemetry: point the
agent's OTLP exporter at Flow Tower (OTLP/HTTP with **JSON** encoding; protobuf is refused with a hint).
The server accepts `POST /v1/logs`, `/v1/metrics` and `/v1/traces`; only logs are read, the other two are
acknowledged and dropped so exporters set up for every signal do not complain.

| Source | Setup | What is read |
|---|---|---|
| **Claude Code** | Merge [`integrations/claude-code/telemetry.json`](../integrations/claude-code/telemetry.json) into `~/.claude/settings.json` (its `env` block) or managed settings, or export in the shell. A project's `.claude/settings.json` does **not** work: Claude Code ignores the telemetry flag and the OTEL exporter variables there. Variables: the same variables: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:5317` | `claude_code.api_request`: `cost_usd`, input / output / cache tokens, model, `query_source`, `agent.name` (subagents); `claude_code.api_error` as an error |
| **Codex** | The `[otel]` block in [`integrations/codex/config.toml`](../integrations/codex/config.toml), merged into `~/.codex/config.toml` (a project `.codex/config.toml` `[otel]` block is ignored): `otlp-http`, `protocol = "json"`, endpoint `http://127.0.0.1:5317/v1/logs` | `codex.sse_event` on `response.completed` (token counts) and `codex.turn_cost` (`usage.estimated_usd`) |

Each one becomes a `usage` event that lands like any other: on the node whose agent matches `agent`
(the subagent name). The main Claude Code thread has no agent name; send its usage to the orchestrator
with a rule such as `match: ["kind:usage&query_source:main"]`. Logs are exported every 5 s.

Totals show in the node panel (Live → usage), in the live feed header (the tower on screen and its
sub-towers) and on library cards. They cover the events the local server keeps (the last 2000), and an
agent present in both a tower and its sub-tower is counted once per project. If `FLOW_TOWER_TOKEN` is
set, add it to the exporter: `OTEL_EXPORTER_OTLP_HEADERS=x-flow-tower-token=<token>`.

**Who and where.** With API-key, Bedrock or Vertex auth Claude Code fills only `user.id` and `session.id`, and sends no `host.name`. Tag each machine with `OTEL_RESOURCE_ATTRIBUTES="enduser.id=alice,team.id=platform,project=flow-tower"`. Prompts, tool inputs and responses stay out unless you turn them on (`OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_ASSISTANT_RESPONSES` for Claude Code; `log_user_prompt` for Codex): all off by default, keep them off.

**Through a collector.** Bodies with `Content-Encoding: gzip` are accepted (the OTel Collector `otlp_http` exporter compresses by default; `compression: none` also works). [`integrations/otel-collector/`](../integrations/otel-collector/) is a per-host collector that adds host and user tags, strips prompt fields, and queues on disk while offline.

`npm run simulate` sends sample `api_request` logs for every agent step, so you can see it without setup.

## History

Live events are kept in memory (2,000, gone on restart). **History** is the durable copy: the accepted
events and their totals, in a local SQLite file, so charts survive a restart and a hub can be asked what
the last weeks looked like.

**Where.** `<FLOW_TOWER_HOME or ~/.config/flow-tower>/history.db`, never in the repo, created owner-only
(0600, WAL). It needs **Node ≥ 22.13** (built-in `node:sqlite`); on an older Node history is off with one
message and the live view keeps working. `history.db` is in the same user folder as the token store, so a
`FLOW_TOWER_HOME` pointing inside the checkout is warned about at startup.

**What is kept — and never kept.** Only metadata: time, sender, user, host, runtime, project, session,
kind, tool, model, token counts, cost, duration, status. **No content, ever**: no prompt or response text,
no file paths or contents, no command arguments, no message strings. The writer copies an allow-list of
columns and nothing else, so a new field a source adds cannot leak in by accident. Alongside the raw rows
are two content-free rollups (events, errors, tokens, cost per user / project / runtime / model): a
`rollup_hourly` bucket per hour and a `rollup_daily` bucket per day.

**Retention.** Raw events are pruned at **14 days** by default — the floor for per-person data is the max
the policy allows; the cap is **21 days**. Set `FLOW_TOWER_RETENTION_DAYS` to change it (clamped 1..21).
Rollups are aggregate and content-free, so they live longer: **90 days** hourly and **13 months** daily.
Pruning runs on server start and hourly.

**Reads.** `GET /api/history?from&to&by=user,project,runtime,model` returns totals (up to 7 days back by
default); the range picks the hourly rollup inside 90 days and the daily one beyond. `GET /api/history/info`
says how many rows there are and how far back they go. Both are viewing routes, gated like `/api/workspace`
(hub viewers only when remote).

**Export and delete your data.**

```bash
flow-tower history info                  # path, rows, users, retention
flow-tower history export [--user <u>]   # JSONL of the event rows to stdout (all users by default)
flow-tower history delete --user <u>     # erase that user's rows, then VACUUM; prints how many went
```

`--user ''` matches the rows that carry no user. The export prints the same allow-listed columns the
writer stores, so it can never contain more than the DB does.

## Matching events to nodes

**The main agent is `main` in every harness** (Claude Code, the Agent SDK, Codex, Pi, Hermes without a profile): one `match: ["agent:main"]` lights the main session whatever the teammate uses; `source` still says which harness sent it.

By default an event lands on:
- **nodes whose agent matches `agent`:** compared against the node id, the label, the agent id and the agent name, ignoring case and punctuation;
- **tool nodes whose id or label matches `tool`:** MCP tools (`mcp__github__create_pr`) also match a tool node named after the server (`github`).

For anything else, add `match:` rules to a node or an agent. Rules use `field:pattern` with `*` wildcards; `&` combines conditions, `!` negates one (`tool:Bash&!message:*npm*test*`), and any matching rule wins. Patterns ignore case and punctuation:

```yaml
- id: deploy
  type: process
  label: Deploy
  match: ["source:github-actions&tool:deploy*", "agent:release-bot"]
```

The feed marks events that matched nothing as *unmapped*, which helps when writing rules.

**On a hub, a teammate's event only lights that teammate's towers** (the ones its machine shared, under `towers/<machine>/`) and the hub's own towers, never another teammate's shared tower (#206), even when the event names a tower (`tower` below then only narrows within those).

**Every tower in the library is matched** otherwise. Two versions of the same project opened together (the one in use and a proposed v2) light up together. To keep them apart, restrict events to one tower with `tower` (matched against the tower id or name): in the event, as `?tower=v2` on the hook URL (`/api/events?source=claude-code&tower=v2`), or `emit --tower v2`. Or open each version on its own server (`--port 5318`): events go only to the server on the port the hooks or `emit --url` point at.

## Security

- The server binds to `127.0.0.1`.
- `/api/events` only accepts an exact `application/json` content type (a variant such as `text/plain;x=application/json` is refused), which forces a CORS preflight, and it refuses browser requests whose `Origin` or `Sec-Fetch-Site` says they come from another site. Web pages open in your browser cannot inject events; local tools (hooks, `emit`, curl, OTLP exporters) send neither header and pass.
- Set `FLOW_TOWER_TOKEN` when starting flow-tower to also require an `x-flow-tower-token` header; `emit` sends it automatically from the same variable.
- `--allowed-host` (or `FLOW_TOWER_ALLOWED_HOSTS`) requires `--hub`: naming a proxy's host means the server is reachable through that proxy, so the hub guards (and its token) apply. Without `--hub` the CLI exits 1.
- Events live in memory only, capped at 2,000 (see **History** for the content-free copy kept in the user folder).

The above is the local-only default. Sharing the server with other machines adds hub mode: setup in
[command-center.md](command-center.md), rules in [hub-reference.md](hub-reference.md).

## References

- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code monitoring (OpenTelemetry): https://code.claude.com/docs/en/monitoring-usage
- Claude Agent SDK hooks: https://code.claude.com/docs/en/agent-sdk/hooks
- Pi extensions and JSON mode: https://github.com/badlogic/pi-mono (`extensions.md`, `json.md`)
- Codex hooks: https://learn.chatgpt.com/docs/hooks
- Codex non-interactive mode (`exec --json`): https://learn.chatgpt.com/docs/non-interactive-mode
- Codex advanced config (`notify`, `[otel]`): https://learn.chatgpt.com/docs/config-file/config-advanced
- Codex source: https://github.com/openai/codex
- Hermes Agent hooks: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
- OpenTelemetry GenAI semantic conventions: https://github.com/open-telemetry/semantic-conventions-genai
