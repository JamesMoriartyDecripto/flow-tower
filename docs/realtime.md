# Live events

Flow Tower can show what your agents are doing **right now**:
- active nodes pulse and send a light beam up through the tower;
- errors flash red;
- the **Live feed** (click **LIVE** in the top bar) lists every event. Click an event to jump to its node.

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

| Source | How | Ready-made config |
|---|---|---|
| **Claude Code** | Native `http` hooks (plus one `command` hook for SessionStart) | [`integrations/claude-code/settings.json`](../integrations/claude-code/settings.json): merge into `.claude/settings.json` |
| **Claude Agent SDK** | Hook callbacks that forward to the endpoint | [`integrations/agent-sdk/flow-tower-hooks.ts`](../integrations/agent-sdk/flow-tower-hooks.ts) |
| **Pi** (coding agent) | Extension listening to `pi.on(...)` events | [`integrations/pi/flow-tower.ts`](../integrations/pi/flow-tower.ts): copy to `~/.pi/agent/extensions/` |
| **Codex** (OpenAI) | Command hooks (`flow-tower emit`), `codex exec --json` stream, or legacy `notify` | [`integrations/codex/`](../integrations/codex): `hooks.json` to `~/.codex/hooks.json`, or `notify` from `config.toml` |
| **Hermes Agent** | Native outbound webhooks | [`integrations/hermes/config.yaml`](../integrations/hermes/config.yaml): merge into `~/.hermes/config.yaml` |
| Shell hooks, cron jobs, CI, your own loops | `flow-tower emit` or plain HTTP | see below |

Notes:
- **Claude Code:** the SessionStart hook is a `command` hook that runs `flow-tower emit`: put the CLI on your `PATH` with `npm link` in your checkout (never `npx flow-tower`: the name is not published on npm, so npx would fetch whatever package claims it). Without it only the session start is missed.
- **Claude Code:** the endpoint answers `204` with an empty body, because Claude Code reads a JSON response body as a hook decision. If the server is down, the hook fails open: the session runs normally and Claude Code only prints a non-blocking "hook failed: ECONNREFUSED" line (checked with a real session).
- **Claude Code subagents:** an `Agent` (formerly `Task`) call starts the subagent and `SubagentStop` ends it. Background subagents (the default) return from the call at once (`status: async_launched`), so their node stays lit until they really stop. Every event a subagent produces carries its **`role`**: the `description` of the `Agent` call that launched it. Several subagents of the same type (`general-purpose`) therefore map to different nodes with `match: ["role:*security*"]`. Resuming one with `SendMessage` starts it again.
- **Claude Code main session:** its events have `agent: main` (`match: ["agent:main"]`). Turns that Claude Code injects (a background subagent reporting back, scheduled tasks, messages from other sessions) arrive through `UserPromptSubmit` but become `log` events with a short summary, not user prompts.
- **Pi:** `pi --mode json "…" | flow-tower emit --source pi` also works for one-off runs.
- **Codex:** approve the hooks once with `/hooks`; hooks in a repo's `.codex/` only run in trusted projects. Hosted tools (web search) do not fire hooks. Tool names match across sources (`Bash`, `apply_patch`, `mcp__<server>__<tool>`); failures are inferred from the tool response (non-zero `exit_code`, `isError`), since hooks carry no status and no tokens.
- **Codex one-off runs:** `codex exec --json "…" | flow-tower emit --source codex` adds token usage per turn (input + output) and `spawn_agent`/`close_agent` subagents. Only the `thread.started` line carries the thread id, so other lines have no session.
- **Codex `notify`:** the legacy hook passes its JSON as the last argument, not stdin, and only reports turn ends. Use it where hooks are unavailable, not together with them.
- **Hermes:** keep it observe-only, with no `fail_closed`. Otherwise a stopped flow-tower would block Hermes' tools.

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

`emit` always exits 0 and gives up after 1.5 s, so it never breaks the thing it observes.

## Tokens and cost (OpenTelemetry)

Hooks say what agents do, not what it costs. Token counts and cost come from OpenTelemetry: point the
agent's OTLP exporter at Flow Tower (OTLP/HTTP with **JSON** encoding; protobuf is refused with a hint).
The server accepts `POST /v1/logs`, `/v1/metrics` and `/v1/traces`; only logs are read, the other two are
acknowledged and dropped so exporters set up for every signal do not complain.

| Source | Setup | What is read |
|---|---|---|
| **Claude Code** | Merge [`integrations/claude-code/telemetry.json`](../integrations/claude-code/telemetry.json) into `.claude/settings.json` (its `env` block), or export the same variables: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:5317` | `claude_code.api_request`: `cost_usd`, input / output / cache tokens, model, `query_source`, `agent.name` (subagents); `claude_code.api_error` as an error |
| **Codex** | The `[otel]` block in [`integrations/codex/config.toml`](../integrations/codex/config.toml): `otlp-http`, `protocol = "json"`, endpoint `http://127.0.0.1:5317/v1/logs` | `codex.sse_event` on `response.completed` (token counts) and `codex.turn_cost` (`usage.estimated_usd`) |

Each one becomes a `usage` event that lands like any other: on the node whose agent matches `agent`
(the subagent name). The main Claude Code thread has no agent name; send its usage to the orchestrator
with a rule such as `match: ["kind:usage&query_source:main"]`. Logs are exported every 5 s.

Totals show in the node panel (Live → usage), in the live feed header (the tower on screen and its
sub-towers) and on library cards. They cover the events the local server keeps (the last 2000), and an
agent present in both a tower and its sub-tower is counted once per project. If `FLOW_TOWER_TOKEN` is
set, add it to the exporter: `OTEL_EXPORTER_OTLP_HEADERS=x-flow-tower-token=<token>`.

`npm run simulate` sends sample `api_request` logs for every agent step, so you can see it without setup.

## Matching events to nodes

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

**Every tower in the library is matched.** Two versions of the same project opened together (the one in use and a proposed v2) light up together. To keep them apart, restrict events to one tower with `tower` (matched against the tower id or name): in the event, as `?tower=v2` on the hook URL (`/api/events?source=claude-code&tower=v2`), or `emit --tower v2`. Or open each version on its own server (`--port 5318`): events go only to the server on the port the hooks or `emit --url` point at.

## Security

- The server binds to `127.0.0.1`.
- `/api/events` only accepts an exact `application/json` content type (a variant such as `text/plain;x=application/json` is refused), which forces a CORS preflight, and it refuses browser requests whose `Origin` or `Sec-Fetch-Site` says they come from another site. Web pages open in your browser cannot inject events; local tools (hooks, `emit`, curl, OTLP exporters) send neither header and pass.
- Set `FLOW_TOWER_TOKEN` when starting flow-tower to also require an `x-flow-tower-token` header; `emit` sends it automatically from the same variable.
- Events live in memory only, capped at 2,000.

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
