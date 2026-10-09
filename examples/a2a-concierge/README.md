# A2A Purchasing Concierge

Google's **Agent2Agent (A2A) purchasing concierge** codelab as a tower. A food-ordering
concierge built with the **Google ADK** runs on **Vertex AI Agent Engine**. It discovers two
remote seller agents through their **agent cards** (`/.well-known/agent.json`) and delegates
orders to them over A2A JSON-RPC `message/send`:

- **Burger seller**: a **CrewAI** crew on **Cloud Run** that asks the user to confirm the items
  and total before it creates the order.
- **Pizza seller**: a **LangGraph** `create_react_agent` on **Cloud Run** that creates the order
  when the request already carries the user's confirmation.

Three frameworks talk to each other over one protocol. The user confirms every order in the chat;
payment is not automated in the codelab and appears as a **planned** node.

```bash
node bin/flow-tower.js examples/a2a-concierge/a2a-concierge.tower.yaml
```

Double-click a seller node to open its sub-tower (`towers/burger-seller.tower.yaml`,
`towers/pizza-seller.tower.yaml`).

## Layers

| Layer | What happens |
|---|---|
| Customer Channel | Gradio chat → Agent Engine `stream_query`, session state, order confirmation (human), payment (planned), order summary |
| Concierge Agent | `before_agent_callback` resolves cards once, dynamic `root_instruction`, seller routing, "already confirmed?" decision, `send_task` tool |
| A2A Discovery & Transport | `A2ACardResolver`, the two agent cards, `A2AClient`, the task result, the shared `contextId` |
| Remote Seller Agents | burger (CrewAI) and pizza (LangGraph) sub-towers, in-memory orders, Cloud Run IAM (planned) |
| Models & Deploy | gemini-2.5-flash, gemini-2.5-flash-lite, Agent Engine and Cloud Run deploys |

## Operational fields exercised

Edge `protocol: a2a` on every concierge → seller call and its result, `protocol: http` for card
discovery and the UI · `approval` on the customer confirmation and on the burger seller's
confirm-first rule · `trigger` (chat, A2A webhook) · `limits.timeout` (30 s httpx client) ·
`credentials: service` · `data.sensitivity` (internal, pci on the planned payment) · `version`
from the agent cards · `status: planned` for payment and Cloud Run IAM.

## Files

```
purchasing_concierge/       ADK agent (send_task, card resolution, instruction provider)
remote_seller_agents/*/     A2A server + agent per seller, and a snapshot of each agent card
prompts/                    concierge instruction and both seller prompts
deploy_to_agent_engine.py   AdkApp → agent_engines.create
purchasing_concierge_ui.py  Gradio chat against the deployed concierge
scripts/deploy_sellers.sh   gcloud run deploy for both sellers
logs/                       one concierge conversation and the burger server log
```

The Python is condensed from the codelab's Apache 2.0 sample. The codelab runs each seller as a
package `__main__.py`; here it is `a2a_server.py`.

## Notes from the source

- The codelab pins `a2a-sdk==0.2.16` (agent card `protocolVersion` 0.2.6, served at
  `/.well-known/agent.json`). The current A2A spec serves `/.well-known/agent-card.json`.
- Both sellers return a **completed** task even when they ask for confirmation. The question is
  read from the artifact text and the follow-up goes out as a new task in the same `contextId`.
  The spec's `input-required` state would model this more precisely.
- Sellers are deployed with `--allow-unauthenticated`, which the codelab says is not recommended
  for production.

## Sources

- Codelab: https://codelabs.developers.google.com/intro-a2a-purchasing-concierge
- Codelab starter repo: https://github.com/alphinside/purchasing-concierge-intro-a2a-codelab-starter
- A2A specification: https://a2a-protocol.org/latest/specification/
- Agent discovery (well-known URI): https://a2a-protocol.org/latest/topics/agent-discovery/
- Life of a task (contextId, input-required, artifacts): https://a2a-protocol.org/latest/topics/life-of-a-task/
