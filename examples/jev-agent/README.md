# Jev Agent

A coding agent harness built around **Jev**, the "System One" decision model from
TypeSafe AI. Jev does not write text: given a state and typed questions it returns a
`noul` (probability that a statement is true), a `choice` (a probability for each declared
candidate, plus confidence) or a `score` (a position on an ordered rubric).

The design principle: **the LLM writes, Jev decides, code acts.**

- Every branching point is a Jev question with declared candidates: routing, tool risk,
  next action, compaction relevance, the Stop check, preference review, browser steps.
- An LLM runs only where text must be written: code and commands (Claude), a form value
  in the browser (Mercury 2.5), and a fallback summary (Haiku).
- Deterministic code turns probabilities into allow / warn / review / block, with the
  thresholds in `config/policy.yaml`.
- Every judgment is logged with its probability and later joined with what happened, so
  the thresholds can be calibrated instead of guessed.

This is a read-only flow-tower example: meant to be read, not run.

```bash
node bin/flow-tower.js examples/jev-agent/jev-agent.tower.yaml
```

## Layers

| Layer | Jev decision | What code does with it |
|---|---|---|
| Intake & Routing | Choice: haiku / sonnet / opus / browser / ask_user | Confidence floor 0.6, per-route floors, sticky pick |
| Act Loop | Nouls: irreversible, leaks_secret, off_task. Choice: continue / run_check / new_hypothesis / finish / escalate | Read-only calls skip Jev; destructive patterns hold offline; ≥ 0.9 holds, 0.5–0.9 warns; 3 identical failures force a new hypothesis |
| Context & Compaction | Two nouls per old tool call: keep_call, keep_result | Keep, truncate to 300 chars or drop; under 25% freed, the LLM summary runs |
| Completion & Review | Nouls: no_action, broken_promise, unverified_done, one per "Done means" rule, one per (hunk, preference) | Block the stop with a fixed nudge, or allow with advisory notes; fails open |
| Models & Observability | (none) | Judgment log → outcome labels → nightly calibration → threshold PR |

The **Browser worker** node drills into `towers/browser.tower.yaml`: snapshot → indexed
element table → one Jev request for operation + speculative targets → validate → execute,
with Mercury writing text only for `TYPE_TEXT`, and an independent check on `DONE`.

## Operational fields used

`decision` on every Jev node: `output` (`choice` with its declared `candidates`, or `binary` for
nouls), `confidence`, the policy `threshold`, the pinned `model: jev-1.13.0` and `fail` (routing
and the Stop check fail open, tool risk fails closed) · `approval` with `when` (ask user under
the confidence floor; hold review `per: tool call`; escalate on p ≥ 0.5 or the cap) · edge
`group`s for the alternatives each policy picks (ask gate, risk verdict, next step, browser
verify) · `evals` with `unit` and `illustrative` (reported values carry their source URL) ·
`budget`, `limits` (timeouts, retries, iteration caps), `fanout` (compaction batches),
`sandbox`, `credentials`, `trigger` (chat, nightly cron), `data` retention on the judgment log.

## Files

```
config/decisions.yaml   every Jev question (type, instructions, criteria)
config/policy.yaml      thresholds and actions, each tagged reported or illustrative
src/jev.ts              System One client: POST /v1/systemone, retries, answer validation
src/route.ts            intake routing
src/risk-gate.ts        ask gate, offline floor, tool-risk nouls, allow/warn/review/block
src/loop.ts             act loop (Claude Messages API) and next-action choice
src/compact.ts          relevance compaction with LLM-summary fallback
src/hooks/stop.ts       Stop hook: premature-stop shapes, done rules, preferences
src/browser.ts          browser worker (Page is an unimplemented CDP adapter)
src/judgments.ts        JSON-lines judgment / action / outcome log
scripts/calibrate.ts    Brier, reliability bins, split-half threshold check
AGENTS.md               the rules and preferences the Stop hook reads
logs/                   a sample judgment log and browser trace (illustrative)
```

## What is verified and what is not

**API shape (verified from the TypeSafe API reference).** The request fields `state`,
`model` and `questions.<id>.{type, instructions, criteria}`, the answer fields (`noul`;
`choice`, `probabilities`, `confidence`; `score`, `legend`), the endpoint
`POST https://api.typesafe.ai/v1/systemone`, Bearer auth, the 429/529 retry advice, the
255-option and 2–10 level limits, and the model ids `jev-latest` and `jev-1.13.0`.
`src/jev.ts` uses only these. The official JS SDK is `@typesafe-ai/sdk`
(`TypeSafeClient`, `systemOne`); it is not used here, to keep timeouts and fail-open in
our hands.

**Not verified, written as adapters or assumptions:**
- `src/browser.ts` declares `openPage()` / `Page` but does not implement CDP.
- The OpenRouter call for Mercury follows OpenRouter's chat-completions API, not a Jev API.
- Removing thinking blocks during compaction (`src/compact.ts`) is our reading of the
  preserved-thinking rules for edited history; test it against your account before relying on it.
- The 32k request limit comes from the fast-jev-compaction README, not from TypeSafe's docs.
- "limpet" (the Stop-hook project named in the brief) could not be found. The Stop hook
  follows **stingray** instead, a Claude Code Stop hook whose every judgment is made by Jev.
- A pi-warden "hold precision of ~88%" could not be found in pi-warden's README or guard
  docs. The tower uses pi-warden's published figures instead (below); 88–89% appears there
  only as the precision of its *conscience* tool recommender.

## Reported vs illustrative values

**Reported** = published by the named project, measured on its own data, not reproduced here.
**Illustrative** = a plausible starting point for this example; replace with your own calibration.

| Value | Status | Source |
|---|---|---|
| irreversible hold 0.9, warn 0.5–0.9 | reported | pi-warden README (default since 0.75.0) |
| ~3 holds per 1,000 calls; 79 of 111 holds re-planned safely; 94 of 124 fake "done"s led to a check | reported | pi-warden README |
| rules precision 0.970 / recall 0.865 at 0.7 (161 cases) | reported | pi-warden docs/guards.md |
| off_task kept trace-only | reported | pi-warden (failed its 0.80 precision gate) |
| keep threshold 0.5, 6 pinned messages, 25k state, 30k request, 300-char head | reported | fast-jev-compaction README |
| compaction ~0.5 s vs ~35 s | reported | jev-compaction-plus repo description |
| 7.1 s flight search; ~$0.004 per task | reported | jev-ultrafast README; Made with Jev directory |
| confidence floor 0.6 | reported (as an example) | TypeSafe "Confidence-gated routing" pattern |
| $42 per billion input tokens, output not billed | reported (vendor) | typesafe.ai |
| route floors 0.7 / 0.75, stop block 0.7, done-rule 0.7 / 0.3, finish 0.7, escalate 0.5 | illustrative | — |
| every eval with `illustrative: true` in the tower, and all of `logs/` | illustrative | — |

Many performance claims around Jev come from the vendor or from project authors measuring
their own tools; secondary articles repeat them. Treat them as starting points.

## Sources opened

Primary (TypeSafe and project repositories):
- https://typesafe.ai — product page, pricing claim
- https://docs.typesafe.ai/introduction and https://docs.typesafe.ai/api — primitives, request and response schema
- https://docs.typesafe.ai/llms.txt — docs index (SDKs, patterns)
- https://docs.typesafe.ai/sdk/javascript.md — `@typesafe-ai/sdk`
- https://docs.typesafe.ai/patterns/confidence-routing.md — confidence floor and per-action thresholds
- https://docs.typesafe.ai/introduction/coding-agents.md — Jev is used from your code, not as the agent's model
- https://www.langchain.com/blog/building-a-harness-with-jev — `langchain-typesafe`, `TypeSafeClassifier`, `ModelRouterMiddleware`, `AutoModeMiddleware`
- https://github.com/DevMortimer/pi-warden (README, docs/guards.md)
- https://github.com/tamaratran/fast-jev-compaction
- https://github.com/browser-use/jev-ultrafast
- https://github.com/doeixd/jev-pref
- https://github.com/jkudish/jev-mcp — providers: TypeSafe, OpenRouter, Cloudflare, Vercel AI Gateway
- https://github.com/Nanako0129/stingray
- https://madewithjev.com — Made with Jev directory
- https://www.promptfoo.dev/docs/providers/typesafe/ — model ids, pinning advice

Secondary (read for orientation, not relied on for numbers):
- https://shop.zimaspace.com/blogs/tech-ai-hub/what-is-jev-ai-decision-model-agents
- https://www.besthub.dev/articles/jev-s-first-week-15-projects-show-how-agents-separate-generation-from-judgment-a5f2f9bcba0a
- https://blog.gopenai.com/what-developers-actually-built-with-jev-in-the-first-week-0af5a892b3cf (returned 403; not read)
