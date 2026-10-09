# Live events

Flow Tower can show what your agents are doing **right now**:
- active nodes pulse and send a light beam up through the tower;
- errors flash red;
- the **Live feed** (click **LIVE** in the top bar) lists every event. Click an event to jump to its node.

Everything stays on your machine. Agents post events to the local server, and the server pushes them to the browser.

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
- **Claude Code:** the endpoint answers `204` with an empty body, because Claude Code reads a JSON response body as a hook decision. If the server is down, the hook simply fails open.
- **Claude Code subagents:** these are detected from the `Agent` (formerly `Task`) tool and from `SubagentStart`/`SubagentStop`.
- **Pi:** `pi --mode json "…" | npx flow-tower emit --source pi` also works for one-off runs.
- **Codex:** approve the hooks once with `/hooks`; hooks in a repo's `.codex/` only run in trusted projects. Hosted tools (web search) do not fire hooks. Tool names match across sources (`Bash`, `apply_patch`, `mcp__<server>__<tool>`); failures are inferred from the tool response (non-zero `exit_code`, `isError`), since hooks carry no status and no tokens.
- **Codex one-off runs:** `codex exec --json "…" | flow-tower emit --source codex` adds token usage per turn (input + output) and `spawn_agent`/`close_agent` subagents. Only the `thread.started` line carries the thread id, so other lines have no session.
- **Codex `notify`:** the legacy hook passes its JSON as the last argument, not stdin, and only reports turn ends. Use it where hooks are unavailable, not together with them.
- **Hermes:** keep it observe-only, with no `fail_closed`. Otherwise a stopped flow-tower would block Hermes' tools.
- **OpenTelemetry (OTLP)** ingestion, for token and cost metrics (Claude Code, Codex `[otel]`), is on the roadmap (#9).

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

From a shell script:

```bash
npx flow-tower emit --kind agent.start --agent nightly-report -m "building report"
npx flow-tower emit --kind error --node build.package -m "exit 1"
```

`emit` always exits 0 and gives up after 1.5 s, so it never breaks the thing it observes.

## Matching events to nodes

By default an event lands on:
- **nodes whose agent matches `agent`:** compared against the node id, the label, the agent id and the agent name, ignoring case and punctuation;
- **tool nodes whose id or label matches `tool`:** MCP tools (`mcp__github__create_pr`) also match a tool node named after the server (`github`).

For anything else, add `match:` rules to a node or an agent. Rules use `field:pattern` with `*` wildcards; `&` combines conditions and any matching rule wins:

```yaml
- id: deploy
  type: process
  label: Deploy
  match: ["source:github-actions&tool:deploy*", "agent:release-bot"]
```

The feed marks events that matched nothing as *unmapped*, which helps when writing rules.

## Security

- The server binds to `127.0.0.1`.
- `/api/events` only accepts `application/json`. That forces a CORS preflight, so web pages open in your browser cannot inject events.
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
