# Ambient Chief of Staff

An **ambient** executive assistant built on the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) (Python). It is
not started by a chat message. Gmail and Calendar push events and a weekday 07:00 cron
wake it up. It triages every email, drafts replies and proposes meetings, and interrupts
the executive only through three kinds of cards: **notify**, **question** and **review**.
Nothing goes out without an approved review card. Every edit she makes teaches it.

The project layout follows Anthropic's chief-of-staff cookbook: `CLAUDE.md` memory, the
`financial-analyst` and `recruiter` subagents, slash commands, the `executive` and
`technical` output styles, plan mode, and PostToolUse hooks writing `audit/`. The
ambient patterns come from LangChain's ambient agents post and its executive AI assistant:
event triggers, a 10-minute sweep cron, ignore/notify/respond triage, the three
human-in-the-loop kinds, and learning from feedback.

The code is meant to be read, not run.

```bash
node bin/flow-tower.js examples/chief-of-staff/chief-of-staff.tower.yaml
```

## User-facing vs background

| Side | Runtimes | Nodes |
|---|---|---|
| **User-facing** (layer 1) | `laptop` (CLI), `inbox_app` (browser), `phone` (device) | terminal, slash commands, output style, report, Review Inbox, notify/question/review cards, push notification |
| **Background** (layers 2-5) | `worker` (Cloud Run), `pubsub`, `cloud_scheduler`, `google`, `anthropic` | push receiver, triage, Chief of Staff runs, subagents, MCP servers, hooks, memory, reflection |

The two sides meet at a few points. Cards reach the inbox and the phone over `http`. Her
answer goes back as `/resume` (`handoff`) and as a feedback event that feeds reflection.

## Layers

| # | Layer | What it shows |
|---|---|---|
| 1 | User-facing: CLI, Inbox & Notifications | The terminal entry, output styles, and the three card kinds with their allowed actions |
| 2 | Background: Triggers & Triage | Gmail/Calendar push (`event`), three crons, the receiver with retries, dedupe, history cursor, the Haiku triage verdict |
| 3 | Background: Chief of Staff | Command expansion, the Opus lead (up to 4 runs in parallel), plan mode and plan files, Task dispatch, card choice, execute-after-approval |
| 4 | Background: Subagents, Tools & Models | 4 subagents (financial-analyst opens a **sub-tower**), the `inbox` and `workspace` SDK MCP servers, scripts, models |
| 5 | Background: Hooks, Memory & Learning | The PreToolUse send gate, three PostToolUse audit hooks, CLAUDE.md, preferences.md, the cards DB, reflection |

`towers/financial-analyst.tower.yaml` drills into one analyst run. It reads the inputs,
runs the scripts, applies the 12-month runway floor, and either recommends or escalates
the decision to the CEO.

## Operational fields used

| Field | Where |
|---|---|
| `trigger` (`event`, `cron`, `manual`) | Gmail and Calendar push, daily brief `0 7 * * 1-5`, sweep `*/10 * * * *`, renew watches (all `timezone: America/Los_Angeles`), CLI |
| `approval` with `actions` | notify and question `[respond, dismiss]`; review `[approve, edit, reject, respond]`, `per: outbound action`, `rounds: 3` (redrafts via `respond`); `via` Review Inbox and push |
| `sla`, `timeout`, `on_timeout` | review 24h; cards wait rather than auto-approve |
| `budget` | Chief of Staff $1.50/40 turns (pause), triage $0.002/1 turn, reflection |
| `limits` | receiver 10s ack with Pub/Sub retries |
| `decision` | triage verdict, plan first?, card kind, durable lesson?, analyst question type |
| edge `async` | push receiver → history (acked first, `BackgroundTasks`), feedback → reflection |
| `fanout` | Chief of Staff 1-4 parallel thread runs |
| `data` | pii (email, cards), confidential (finance, preferences, audit) |
| `credentials: user` | every Gmail/Calendar call uses the executive's OAuth token |
| `sandbox` | lead allowlist (Google APIs, Anthropic); scripts with no network; analyst read-only |
| `evals`, `version`, `rollout` | triage v3 in `shadow` against v2; targets for agreement, dismissals, unedited drafts |
| edge `protocol` | `webhook` (push), `http` (crons, inbox), `mcp` (inbox/workspace), `stdio` (command hooks) |

## Sources

- https://platform.claude.com/cookbook/claude-agent-sdk-01-the-chief-of-staff-agent
- https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/chief_of_staff_agent
  (`agent.py`, `CLAUDE.md`, `.claude/agents`, `.claude/commands`, `.claude/hooks`,
  `.claude/output-styles`, `settings.local.json`, `flow_diagram.md`). Hooks live in
  `.claude/settings.json` here, so they are committed and loaded with `setting_sources=["project"]`.
- https://www.langchain.com/blog/introducing-ambient-agents
- https://github.com/langchain-ai/executive-ai-assistant (`eaia/main/graph.py`,
  `human_inbox.py`, `cron_graph.py`, `reflection_graphs.py`, `config.yaml`, `scripts/setup_cron.py`)
- Claude Agent SDK Python API (`create_sdk_mcp_server`, `@tool`, `HookMatcher`,
  `ClaudeAgentOptions`), checked via Context7
