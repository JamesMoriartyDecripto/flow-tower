# Examples

Every example is a real, validated tower: each prompt, script, config and log it references exists, and each folder has a README with its sources. Open one with `node bin/flow-tower.js examples/<folder>`, or all of them with `npm run dev`.

**Writing a new tower?** Copy the closest example below rather than reading them all.

## Starters: one short file each

| Folder | Layers | Use it as a model for |
|---|---|---|
| [`starters/single-agent`](starters/single-agent) | 1 | The smallest useful tower: one agent in a tool loop |
| [`starters/rag-bot`](starters/rag-bot) | 2 | Offline pipeline feeding an online flow, one cross-layer link, cron + chat triggers |
| [`starters/pr-reviewer`](starters/pr-reviewer) | 3 | CI agent: webhook trigger, sandbox, human approval |
| [`starters/voice-assistant`](starters/voice-assistant) | 3 | On-device runtimes around a cloud model, data sensitivity |

## Presets by pattern

| Folder | Layers | Use it as a model for |
|---|---|---|
| [`dev-squad`](dev-squad) | 8 | Coding agents on the Claude Agent SDK: orchestrator-workers, review loop, hooks, MCP, memory, `from:` agent files |
| [`game-studio`](game-studio) | 14 | Very large system: many departments, nesting depth 2, stress test |
| [`course-studio`](course-studio) | 12 | Content production: parallel writers, review board, publishing |
| [`web-studio`](web-studio) | 8 | Product build with separate frontend and backend sub-towers, client approvals, Lighthouse / axe evals, canary rollout |
| [`sre-incident`](sre-incident) | 5 | Event-driven ops: webhook per alert, investigation split from remediation, approval with timeout, postmortem |
| [`fraud-desk`](fraud-desk) | 5 | Regulated decisions: hard pre-checks, escalation thresholds, append-only audit, PII retention, shadow rollout |
| [`deep-research`](deep-research) | 5 | Dynamic fan-out (1–10 parallel subagents), per-role models, budgets, evals |
| [`co-scientist`](co-scientist) | 5 | Long-running queue-driven loop, tournament ranking, scientist in the loop |
| [`airline-support`](airline-support) | 5 | Peer handoffs, guardrails that trip, browser UI vs server agents over HTTP |
| [`chief-of-staff`](chief-of-staff) | 5 | Ambient agent: event + cron triggers, notify / question / review human-in-the-loop, memory, audit hooks |
| [`browser-worker`](browser-worker) | 5 | Computer-use agent: browser runtime, live-view takeover, session recordings, TTLs |
| [`a2a-concierge`](a2a-concierge) | 5 | Agents from different frameworks over A2A, one sub-tower per remote agent |
| [`legal-diligence`](legal-diligence) | 5 | Per-document fan-out, approvals at every step, confidential EU-resident data |
| [`jev-agent`](jev-agent) | 5 | Decision-model harness: typed decisions with thresholds, LLM only where text is needed, code enforces |
| [`social-studio`](social-studio) | 6 | Social media operations: per-platform fan-out and API quotas, approval gates, comment/DM triage, weekly loop |
| [`ai-video-studio`](ai-video-studio) | 7 | Async media generation: per-shot sub-tower, render jobs with polling / webhooks, per-shot budgets that downgrade, consent and C2PA labelling |
| [`ebook-studio`](ebook-studio) | 7 | Publishing pipeline: per-chapter writing sub-tower with continuity checks, editorial approvals, EPUB build and validation, store AI-disclosure rules |
| [`mobile-studio`](mobile-studio) | 8 | Mobile release engineering: iOS and Android sub-towers, device matrix, store review waits, phased rollout with crash-rate guard, OTA updates |
| [`marketing-studio`](marketing-studio) | 8 | Spend-controlled marketing: paid-media optimization sub-tower with spend guard and approval thresholds, lifecycle email, lead scoring, measurement loop |
| [`sales-pipeline`](sales-pipeline) | 8 | B2B sales from prospect to invoice: lawful-basis checks for EU/Italian outreach, outreach sequence sub-tower, discount and contract approvals, e-signature, invoice handoff |
| [`invoicing-fic`](invoicing-fic) | 8 | Italian e-invoicing with Fatture in Cloud: fiscal checks, idempotent issue, SDI send-and-monitor sub-tower with rejection loop, dunning, passive cycle, 10-year retention |
| [`release-auditor`](release-auditor) | 6 | Pre-release bug sweep, dogfooded on this repo: deterministic gates, Playwright sweep sub-tower, one finder per charter, adversarial verifier, test-first fixes; `root: ../..` so nodes open real repo files, scripts report live |

## Beyond agents: notes and playbooks

| Folder | Layers | Use it as a model for |
|---|---|---|
| [`physics-notes`](physics-notes) | 4 | A method on top that routes to chapters below, formulas in descriptions, notes pages behind every node |
| [`history-notes`](history-notes) | 5 | Phases in time order, cause and effect across layers, people as a supporting layer |
| [`db-api-playbook`](db-api-playbook) | 6 | A playbook: decisions on top, one layer per phase, a request pipeline sub-tower with every early exit (401, 429, 412…) into one Problem Details output |

## Rules every example follows

- `node bin/flow-tower.js validate examples/<folder> --json` reports 0 errors and 0 warnings (`tests/examples.test.ts` enforces it, plus no git-ignored files).
- Real model ids and tool names only when verified; illustrative numbers (eval targets, budgets) are labelled as such in the README.
- No real secrets: credentials and keystores are placeholders.
