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
- `--allowed-host` (or `FLOW_TOWER_ALLOWED_HOSTS`) requires `--hub`: naming a proxy's host means the server is reachable through that proxy, so the hub guards (and its token) apply. Without `--hub` the CLI exits 1.
- Events live in memory only, capped at 2,000.

The above is the local-only default. Sharing the server with other machines adds hub mode: see
**Connect remote sources** and **Security model** below.

## Connect remote sources

By default Flow Tower only listens on `127.0.0.1`: a second machine, a teammate or a cloud runner cannot
reach it. Hub mode opens the event ingest to them **without** letting them read your files.

```bash
npm link                              # put flow-tower on your PATH (see the notes above)
flow-tower token add alice            # prints ft_alice_<secret> once: hand it to that machine
flow-tower --hub --allowed-host hub.tailnet-xyz.ts.net
```

In the flow-tower checkout, start the dev server with the flags, or `FLOW_TOWER_HUB=1`. Then put
`tailscale serve` in front of it ([tailscale.com/kb/1312/serve](https://tailscale.com/kb/1312/serve)):
the server still binds loopback and never a public interface, and Tailscale terminates TLS and forwards
to it. Never use `tailscale funnel` for this: Funnel exposes to the whole internet, serve to your tailnet.

A remote sender posts to the usual `/api/events` (or `/v1/logs`) with its token:
`x-flow-tower-token: ft_alice_<secret>` (the OTel exporters and the collector use a `Authorization: Bearer`
too). What it may do:

- **ingest events** with a valid token — the token id becomes the sender, and events are attributed to it;
- **view** the UI (read-only) only when its tailnet login is listed in `~/.config/flow-tower/hub.json`:

  ```json
  { "viewers": ["alice@example.com"] }
  ```

- **nothing else**. Files (`/api/file`), voice (`/api/voice`) and every write are refused for remote
  requests: they act on the machine that runs Flow Tower, not on the sender's.

Hub mode needs at least one token to start: a shared hub must never accept an unsigned event. Rate limits,
dedupe and a ±24 h timestamp window apply to remote senders (see **Security model** below). Recipes live
under [`integrations/hub/`](../integrations/hub/): ACLs, GitHub Actions, Docker and Lambda.

**Public ingest-only (Fallback).** When a Tailscale tailnet is not an option (AWS Lambda, a CI runner),
run `flow-tower --ingest-only` behind Caddy or Cloudflare Tunnel. That mode serves **nothing but** the
ingest routes, needs a token for every request (like hub mode), and 404s everything else even locally; it
must never be exposed without one of those proxies in front, and
it is a last resort, not the default. See [`integrations/hub/Caddyfile`](../integrations/hub/Caddyfile).

### Recipe: a second computer

Both machines join the same tailnet. On the hub machine:

```bash
flow-tower token add laptop
flow-tower ~/towers/game-studio.tower.yaml --hub --allowed-host hub.tailnet-xyz.ts.net
tailscale serve --bg --https=443 http://127.0.0.1:5317
```

On the laptop, send events with the token (or set `FLOW_TOWER_TOKEN=ft_laptop_…` and let `emit` pick it up):

```bash
FLOW_TOWER_URL=https://hub.tailnet-xyz.ts.net \
flow-tower emit --kind tool.start --agent claude-code -m "opened the repo"
```

Open `https://hub.tailnet-xyz.ts.net` in the laptop browser to watch, if its tailnet user is a viewer.

### Recipe: a teammate

Same as above, but create a token per person (`flow-tower token add bob`) and add their email to
`viewers` if they should watch, not just send. Attribute usage with `OTEL_RESOURCE_ATTRIBUTES="enduser.id=bob"`.
When they leave, `flow-tower token revoke bob` stops their sender at once; `pause` / `resume` do the same
temporarily. The plaintext is never stored, only its sha256, so a stolen `tokens.json` is useless.

### Recipe: a VPS / Docker host (collector sidecar)

Run the collector next to the agent on the VPS, so only usage leaves the host and prompts stay in. The
sidecar forwards to your hub over the tailnet; see [`integrations/hub/docker-compose.yml`](../integrations/hub/docker-compose.yml)
and [`integrations/otel-collector/collector.yaml`](../integrations/otel-collector/collector.yaml). Set
`FLOW_TOWER_URL=https://hub.tailnet-xyz.ts.net` and `FLOW_TOWER_TOKEN=ft_vps_…` on the sidecar.

### Recipe: GitHub Actions

A workflow can watch a CI run in your tower. The runner joins the tailnet with an ephemeral node tagged
`tag:ci` and posts to the hub — see [`integrations/hub/github-actions.yml`](../integrations/hub/github-actions.yml)
and the ACL in [`integrations/hub/acl.hujson`](../integrations/hub/acl.hujson). The tailnet ACL must grant
`tag:flow-sender` (the sender) access to the hub's `tag:flow-hub` on port 443, and the tag itself must be
allowed to use the tailnet — an untagged, ephemeral node cannot.

### Recipe: AWS Lambda

Lambda has no loopback and its own filesystem is read-only, so pick one:

- run the **OTel Collector as a Lambda layer** and let it hold the tailnet userspace networking
  ([tailscale.com/kb/1113/aws-lambda](https://tailscale.com/kb/1113/aws-lambda)), forwarding OTLP to the hub; or
- send **OTLP/HTTP directly** to the public ingest-only endpoint (`--ingest-only` behind Caddy or Cloudflare
  Tunnel), with `x-flow-tower-token` on every request. Direct is simplest but exposes an ingest endpoint to
  the internet, so a token is mandatory (the hub rate-limits ingest itself).

## Security model

Hub mode changes what the server accepts, so state it once, here:

- **Binding.** Without `--hub` the server refuses a non-loopback `--host`, and `--allowed-host` (a proxy's
  own Host header means the server is reachable through that proxy) is refused too: the CLI exits 1 and says
  to add `--hub`. With `--hub` it still runs on `127.0.0.1` and is reached only through `tailscale serve`
  (TLS on the tailnet). Never Funnel.
- **Sender identity.** A per-sender token (`flow-tower token add|list|revoke|pause|resume`) is stored as
  its **sha256** in `~/.config/flow-tower/tokens.json` (0600), never the plaintext. The **token decides who
  sent it**: the id in `ft_<id>_<secret>` is the sender, and events are attributed to it. `revoke` /
  `pause` take effect on the next request, with no server restart. The legacy single `FLOW_TOWER_TOKEN`
  still works and is attributed to `default`.
- **What a remote request can do.** Ingest an event with a token, and — for a tailnet user listed in
  `hub.json` `viewers` — view the UI read-only. It can never read files, drive voice or make any other
  write: those routes answer 403 to a remote request. Anything the socket or the proxy headers say came
  from off the machine is treated as remote.
- **Public fallback.** `--ingest-only` serves only `/api/events` and `/v1/*`, to anyone, and 404s
  everything else including locally. It needs a token for **every** request, like hub mode: the CLI exits 1
  without `FLOW_TOWER_TOKEN` or an active per-sender token. Put Caddy or Cloudflare Tunnel in front; it is
  for Lambda and CI, never for a workstation hub.
- **Viewing is gated everywhere it reaches the host.** A WebSocket upgrade (Vite HMR/ws) is checked the
  same way as a page view: only loopback, or a listed viewer through the local proxy, may open it, so a
  remote stranger cannot subscribe to the live event stream. A remote viewer also never reaches Vite's
  `/@fs/` (which would read any file on the host) nor the file and voice routes (`/api/file`, `/api/voice`).
- **Abuse limits.** Per-sender token bucket (20 events/s, burst 200; 429 with `Retry-After`), an LRU
  dedupe of event ids (50,000) so a retrying sender cannot replay the same event, and a ±24 h window around
  now so a skewed or backdated timestamp is dropped. All in memory: a restart forgets them.
- **Transport.** Ingest bodies keep their existing caps (JSON, gzip decompressed cap, `MAX_BATCH`), the
  exact `application/json` content type and the same-site checks as the local server. `/api/events` still
  answers `204` with an empty body. Local requests (no proxy header, loopback socket) keep the old
  behaviour: no token needed unless `FLOW_TOWER_TOKEN` is set.

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
- Tailscale serve: https://tailscale.com/kb/1312/serve (ACLs: https://tailscale.com/kb/1018/acls)
- Tailscale on AWS Lambda (userspace networking): https://tailscale.com/kb/1113/aws-lambda
- GitHub Actions + Tailscale: https://github.com/tailscale/github-action
