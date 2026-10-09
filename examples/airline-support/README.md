# Airline Customer Service

A flow-tower model of OpenAI's **customer service agents demo**, built on the
[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) with a ChatKit UI.
A Triage Agent routes each chat to five peer specialists. The specialists hand off to
each other directly, with no central orchestrator. Two LLM input guardrails can "trip"
any message. All agents share one typed context that holds the passenger's booking.

The agents run on **gpt-5.2** and the guardrails on **gpt-4.1-mini**, the same OpenAI
models the source uses. The Python under `python-backend/` is an abridged mirror of the
upstream code, kept to under 80 lines per file. It is meant to be read, not run.

```bash
npx flow-tower examples/airline-support/airline-support.tower.yaml
```

## Layers

| # | Layer | Runtime | What it shows |
|---|---|---|---|
| 1 | Web UI (frontend) | `ui` browser, `console` browser | ChatKit chat widget, streamed reply, seat map, the Agent View panels (agents list, guardrail lights, runner output, context), and the planned human-agent console with payout approvals |
| 2 | API & Guardrails | `backend` server | `POST /chatkit`, `/chatkit/state`, the SSE state stream, `Runner.run_streamed`, relevance and jailbreak guards, the tripwire leading to a refusal |
| 3 | Agents & Handoffs | `backend` | Triage plus five specialists, `on_handoff` hydration hooks, the return path to Triage, the planned Baggage Agent and escalation ticket |
| 4 | Function Tools | `backend` | The real tool names (`flight_status_tool`, `book_new_flight`, `issue_compensation`...) and the planned payout gate |
| 5 | Shared Context, State & Models | `backend`, `openai` saas | `AirlineAgentContext` (PII), `public_context()` filter, in-memory stores, gpt-5.2, gpt-4.1-mini |

**Frontend and backend.** Every edge between the browser and the server is an object-form
link with `protocol: http`: the chat POST, the SSE reply, the state fetches, the four SSE
feeds into the Agent View panels, the seat-map sentinel, and the payout approval. The
escalation ticket reaches the staff console as a `webhook`.

Dashed nodes (`status: planned`) are **production extensions that the demo does not
have**:

- **Approval for payouts above $500 or any cash refund.** This uses the SDK's
  `needs_approval` tool policy, which pauses the run until a duty manager approves or
  rejects it (`python-backend/airline/approvals.py`).
- **Live-agent escalation.**
- **The Baggage Agent.** The upstream prompts already hand off to it, but it is never
  registered.

## Operational fields used

| Field | Where |
|---|---|
| `trigger: chat` | `ui.chat` |
| `budget.turns` | `api.runner` (SDK default `max_turns` 10, `MaxTurnsExceeded` caught) |
| `data` (pii, phi, public; retention, region) | every agent; `special_seat` is phi |
| `credentials: service` | the agents that write bookings |
| `approval` + `sla` | `ui.duty_manager`, `ui.agent_console` |
| `evals` (targets only, no measured values) | relevance and jailbreak guardrails |
| edge `protocol` (http, webhook) | all frontend/backend links, the Responses API calls, escalation |

## Sources

- https://github.com/openai/openai-cs-agents-demo (README, `python-backend/airline/agents.py`,
  `guardrails.py`, `tools.py`, `context.py`, `demo_data.py`, `server.py` (mirrored here as
  `airline_server.py`), `main.py`, `memory_store.py`, the `ui/` components)
- https://openai.github.io/openai-agents-python/ (human-in-the-loop: `needs_approval`,
  `result.interruptions`, `RunState.approve/reject`, checked via Context7)
