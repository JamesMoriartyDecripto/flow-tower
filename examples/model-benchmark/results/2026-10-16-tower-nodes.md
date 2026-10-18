# Model benchmark: roles of the example towers, 2026-10-16

> **Scope.** This is the pick **per node** when the harness fixes the model family (a Claude Code node chooses among Claude models, a Gemini node among Gemini models). The pick **per role across families** is the [role catalogue](../../../skills/flow-tower-costs/catalogue.md), from a separate run the same day ([2026-10-16-roles/](2026-10-16-roles)). Where the two disagree, this page says so.

Phase 4 of the tower optimization (#231): one benchmark per **role**, not per tower, for the models the 22 optimizer reports flagged ("Models to benchmark" in `examples/tower-optimizer/reports/*.compare.md`). Every candidate runs on the node's own harness: the Claude Agent SDK and Claude Code towers only take Claude models, airline-support (OpenAI Agents SDK) only OpenAI models, co-scientist (`google.genai`) only Gemini models.

**Runs.** 409 runs through OpenRouter (`require_parameters`, `data_collection: deny`, effort low, a fresh session per run).
- Reviewer, planner, writer and coder are the high-volume or high-stakes roles: 3 tasks × 5 runs per model.
- Summarizer, doc-writer and intent are clear-cut: 2-4 tasks × 3 runs.
- Vision: 4 tasks × 5 runs. Its images are sent with the new `images:` front-matter key.

Every cell has n ≥ 3 per model and task, so no category is ILLUSTRATIVE.

**Scoring.** Deterministic checks first (`judge.mjs`). The rubric answers were then scored blind, twice (forward, then reverse order), by `z-ai/glm-5.3-flashx`, a family no candidate belongs to. The final score is the lower of the two passes, and pass is 7 or more. Notes per answer are in `2026-10-16-tower-nodes-<category>.scores-notes.md`. No answer had a gap above 2 points between the passes. "Correct" below means the deterministic check passed and, for rubric tasks, the score is at least 7.

**Retired tasks.** Three keys proved wrong after the first runs, and rubric.md says a wrong key is never edited: it gets a new task id. So `tasks/retired/` holds the three originals for the record, and they are never run again:
- `tallymoor-landing`: its must-not also matched a note saying a claim was left out;
- `hub-pause-415`: its pattern missed a correct root cause written with backticks;
- `ebook-outline-change`: its pattern missed plans that "freeze" drafting.

Each has a v2 that was rerun for every model. Their 49 runs are kept in `2026-10-16-tower-nodes-retired.jsonl` and are not counted below.

**Results on endpoints.** `openai/gpt-4.1-mini`, airline-support's guard model, has no endpoint that honours the data policy: one smoke run answered HTTP 404 "No endpoints found". `google/gemini-2.0-flash`, co-scientist's model, is no longer listed on OpenRouter, so `gemini-2.5-flash` stands in as the older baseline.

**Spend.** The runs cost $2.46. The blind verifier cost $1.87 of metered calls, plus two passes that a restart interrupted (unmetered, $0.5 at most). The squad step for image input cost $0.01. In total about **$4.3-4.8, or €4.0-4.5** at €0.926 per $, against a €25 cap. The key's own daily counter reads $3.39.

**What the tasks cannot tell.** They are short, real cases from this repository and the example towers, not each system's own traffic. A switch below is "evidence says it holds on these cases". Nodes that have their own evals (`evals:` in the tower) should confirm it on those before the model changes. The vision fixtures are clean local renders: real video frames and portal screenshots are noisier.

## reviewer

3 tasks (events-204, store-mutation, history-dedupe), 5+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | 15 | 15/15 | 9.7 [6.9-21.3] | 4.6 | 2 | $0.0022 | $0.0023 | 0%, 0/15 warm | 0 | - | Google, Google AI Studio |
| `anthropic/claude-opus-5.5` | 15 | 15/15 | 13.1 [9.2-20.0] | 2.7 | 2 | $0.020 | $0.020 | 79%, 10/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 15 | 12/15 | 7.3 [5.8-9.2] | 1.0 | 2 | $0.0074 | $0.0099 | 79%, 10/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-haiku-5.5` | 15 | 10/15 | 7.3 [5.8-11.5] | 0.9 | 2 | $0.0006 | $0.0009 | 79%, 10/15 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-2.5-flash` | 15 | 2/15 | 7.4 [4.4-19.8] | 1.9 | 2 | $0.0027 | $0.021 | 0%, 0/15 warm | 0 | - | Google |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## planner

3 tasks (web-change-request, hub-pause-415-v2, ebook-outline-change-v2), 5+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 15 | 15/15 | 6.2 [5.5-12.1] | 1.4 | 1 | $0.0006 | $0.0006 | 27%, 3/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 15 | 15/15 | 8.3 [7.1-9.7] | 1.0 | 1 | $0.011 | $0.010 | 27%, 3/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 15 | 15/15 | 14.7 [9.5-23.9] | 7.4 | 1 | $0.024 | $0.027 | 27%, 3/15 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 15 | 13/15 | 4.4 [3.5-8.4] | 1.5 | 1 | $0.0020 | $0.0022 | 0%, 0/15 warm | 0 | - | Google |
| `google/gemini-2.5-flash` | 15 | 10/15 | 6.9 [5.2-11.0] | 5.2 | 1 | $0.0033 | $0.0047 | 0%, 0/15 warm | 0 | - | Google |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## writer

3 tasks (halden-battery-cold, tallymoor-landing-v2, halden-public-reply), 5+ runs each. Only 3 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 15 | 15/15 | 6.6 [1.4-11.8] | 5.6 | 1 | $0.0006 | $0.0005 | 25%, 3/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 15 | 15/15 | 5.1 [1.4-7.6] | 0.8 | 1 | $0.0063 | $0.0054 | 25%, 3/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 15 | 15/15 | 9.4 [3.3-11.7] | 3.8 | 1 | $0.015 | $0.013 | 25%, 3/15 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## coder

3 tasks (format-price, parse-edge, shell-path), 5+ runs each. Only 3 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 15 | 15/15 | 4.4 [1.4-8.3] | 4.4 | 1 | $0.0003 | $0.0003 | 0%, 0/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 15 | 15/15 | 2.8 [1.6-7.2] | 1.1 | 1 | $0.0047 | $0.0050 | 0%, 0/15 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 15 | 15/15 | 6.8 [2.8-9.3] | 5.6 | 1 | $0.011 | $0.010 | 0%, 0/15 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## summarizer

2 tasks (fraud-desk-facts, sre-incident-facts), 3+ runs each. Only 3 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 5.6 [5.3-6.9] | 5.6 | 1 | $0.0003 | $0.0008 | 67%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.7 [1.5-3.7] | 1.3 | 1 | $0.0024 | $0.013 | 67%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 6 | 6/6 | 3.0 [2.7-4.5] | 2.2 | 1 | $0.0049 | $0.026 | 67%, 4/6 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## doc-writer

2 tasks (changelog-entry, hook-gotcha), 3+ runs each. Only 3 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 1.6 [1.4-1.9] | 0.8 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.7 [1.4-2.6] | 0.9 | 1 | $0.0019 | $0.0020 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 6 | 6/6 | 3.2 [3.0-4.9] | 1.8 | 1 | $0.0038 | $0.0039 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## intent

4 tasks (airline-relevance, airline-routing, navigation, node-and-layer), 3+ runs each. Only 2 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 12 | 12/12 | 1.7 [1.0-3.9] | 1.4 | 1 | $0.0001 | $0.0001 | 0%, 0/12 warm | 0 | - | OpenAI |
| `openai/gpt-5.2` | 12 | 12/12 | 1.6 [1.1-3.1] | 1.0 | 1 | $0.0011 | $0.0013 | 0%, 0/12 warm | 0 | - | OpenAI |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## vision

4 tasks (frame-contact-sheet, portal-add-driver, portal-referral-banner, portal-licence-char), 5+ runs each. Only 3 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 20 | 20/20 | 5.0 [3.1-6.5] | 5.0 | 1 | $0.0001 | $0.0001 | 80%, 16/20 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 20 | 20/20 | 3.2 [2.2-4.7] | 2.2 | 1 | $0.0024 | $0.0027 | 80%, 16/20 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 20 | 20/20 | 4.0 [2.7-7.6] | 3.3 | 1 | $0.0025 | $0.0029 | 80%, 16/20 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## Per-role verdicts

| Role (category) | Verdict | Evidence (correct, $ / correct, median s, mean rubric) |
|---|---|---|
| Reviewer, verifier, judge (reviewer) | **Keep Opus.** Neither cheaper Claude holds recall. | Opus 15/15, $0.020, 13.1 s, 8.9 · Sonnet 12/15, $0.0099, 7.3 s · Haiku 10/15, $0.0009 (both miss the hook-decision defect in events-204) |
| Reviewer on Gemini (reviewer) | **Switch to `gemini-3.8-flash`.** | gemini-3.8-flash 15/15, $0.0023, 9.7 s, 9.4 · gemini-2.5-flash 2/15 (twice it called a planted bug "fine") |
| Planner, orchestrator, lead (planner) | **Switch Opus to Sonnet.** Same correctness at about 1/3 of the cost; Haiku also passes, with a lower mean. | Opus 15/15, $0.027, 14.7 s, 9.5 · Sonnet 15/15, $0.010, 8.3 s, 9.3 · Haiku 15/15, $0.0006, 6.2 s, 8.9 · gemini-3.8-flash 13/15 · gemini-2.5-flash 10/15 |
| Writer, brand and marketing copy (writer) | **Opus to Sonnet.** Haiku for reformatting work; Sonnet stays where brand voice is the product. | Opus 15/15, $0.013, 9.2 · Sonnet 15/15, $0.0054, 8.9 · Haiku 15/15, $0.0005, 8.6, no answer under 7 |
| Coder (coder) | **Opus to Sonnet; Sonnet to Haiku** for scoped work. The tasks are single-file, so a coder that acts on production keeps its model until its own evals agree. | all 15/15 · Opus $0.010, 6.8 s · Sonnet $0.0050, 2.8 s · Haiku $0.0003, 4.4 s |
| Summarizer, long context (summarizer) | **Switch to Haiku.** | all 6/6 on 27-36 KB inputs · Opus $0.026 · Sonnet $0.013 · Haiku $0.0008 |
| Doc writer, postmortem (doc-writer) | **Switch to Haiku.** | all 6/6 · Haiku $0.0001, 9.8 · Sonnet $0.0020, 9.3 · Opus $0.0039, 10.0 |
| Router and relevance guard on OpenAI (intent) | **Switch to `gpt-6-luna`.** | gpt-6-luna 12/12, $0.0001, 1.7 s · gpt-5.2 12/12, $0.0013, 1.6 s · gpt-4.1-mini: no endpoint under the data policy |
| Vision, screenshot and frame QA (vision) | **Frame QA (spotting a defect) to Haiku; the pre-submit verifier to Sonnet**. Reading exact values off a screen is another job: in the catalogue run Haiku read the node-inspector and tower-overview panels 3/6, so a node that reads values keeps Sonnet or GLM. The verifier keeps a margin because the fixtures are clean renders and a wrong endorsement cannot be undone. | all 20/20, including a one-character licence slip · Haiku $0.0001 · Sonnet $0.0027 · Opus $0.0029 |
| Research, analysis, computer use, Figma edits | **Not benchmarked: keep.** No task set covers them yet. | - |

## Per-role recommendation for the example towers

One row per node flagged in the optimizer reports. "Keep" when a cheaper model lost quality or when no task set covers the role.

| Tower | Node | Current | Recommended | Evidence |
|---|---|---|---|---|
| ai-video-studio | `script.variants` | Opus | **Haiku** | writer: reformatting an approved script; Haiku 15/15, mean 8.6 |
| ai-video-studio | `script.writer` | Opus | **Sonnet** | writer: Sonnet 15/15, 8.9 vs Opus 9.2, $0.0054 vs $0.013 / correct |
| ai-video-studio | `brief.hooks` | Sonnet | keep | not benchmarked; it has its own eval (predicted 3 s hold) |
| ai-video-studio | `qa.frame_qa` | Sonnet | **Haiku** | vision: Haiku 20/20, $0.0001 / correct |
| airline-support | `agents.triage` | gpt-5.2 | **gpt-6-luna** | intent: 12/12 both, $0.0001 vs $0.0013 / correct |
| airline-support | `agents.faq` | gpt-5.2 | keep | not benchmarked (answers from a tool; no FAQ task set) |
| airline-support | `api.relevance` | gpt-4.1-mini | **gpt-6-luna** | gpt-4.1-mini has no endpoint under the data policy; gpt-6-luna passed the relevance task 3/3 |
| airline-support | `api.jailbreak` | gpt-4.1-mini | keep, re-check | not tested here; gpt-4.1-mini has no endpoint under the data policy, so it needs a replacement: the catalogue's guard pick (`z-ai/glm-5.3-flash`, 6/6) is the candidate for its eval |
| browser-worker | `verify.verifier` | Opus | **Sonnet** | vision: 20/20 for all; Sonnet keeps a margin over Haiku for an irreversible submit |
| browser-worker | `worker.worker` | Sonnet | keep | computer use: not benchmarked |
| chief-of-staff | `harness.reflect` | Opus | **Sonnet** | writer: 15/15, 8.9 |
| chief-of-staff | `orchestration.cos` | Opus | **Sonnet** | planner: 15/15, 9.3 vs 9.5 |
| chief-of-staff | `specialists.drafter` | Sonnet | keep | brand voice in the user's name; Haiku is a candidate for its eval ("drafts sent unedited") |
| co-scientist | `generate.deep_review`, `tournament.meta` | gemini-2.0-flash | **gemini-3.8-flash** | reviewer: 15/15 vs gemini-2.5-flash 2/15 |
| co-scientist | `generate.generation`, `tournament.evolution` | gemini-2.0-flash | **gemini-3.8-flash** | planner (closest set): 13/15 vs gemini-2.5-flash 10/15 |
| course-studio | `review.pedagogy`, `review.rights` | Opus | keep | reviewer: Sonnet 12/15, Haiku 10/15 |
| course-studio | `review.consolidate` | Opus | **Haiku** | writer, merging notes into one list: Haiku 15/15 |
| course-studio | `design.architect` | Opus | **Sonnet** | planner: 15/15 |
| deep-research | `synthesis.writer` | Opus | **Sonnet** | writer: 15/15; the verifier behind it stays |
| deep-research | `search.compress` | Sonnet | **Haiku** | summarizer: 6/6, $0.0008 vs $0.013 / correct |
| deep-research | `ops.judge` | Opus | keep | reviewer: only Opus holds 15/15 |
| dev-squad | `orchestration.architect` | Opus | **Sonnet** | planner: 15/15 (it includes the real #206 bug plan) |
| dev-squad | `quality.verifier` | Opus | keep | reviewer: only Opus holds 15/15 |
| dev-squad | `specialists.tester` | Sonnet | **Haiku** | coder: 15/15, $0.0003 vs $0.0050 / correct |
| ebook-studio | `editing.dev_edit` | Opus | **Sonnet** | writer: 15/15 |
| ebook-studio | `outline.outliner` | Opus | **Sonnet** | planner: 15/15, including the mid-book change task |
| ebook-studio | `drafting.writer` | Sonnet | keep | book prose is the product; Haiku (8.6 vs 8.9) is a candidate behind the dev edit |
| fraud-desk | `review.reviewer` | Haiku | keep, re-check | reviewer (code review): Haiku 10/15 vs Opus 15/15. Its own escalation-recall eval decides; the code tasks are not its domain |
| fraud-desk | `desk.packet` | Sonnet | **Haiku** | summarizer: 6/6 |
| game-studio | six evaluators (`preprod.critic`, `review.code_reviewer`, `export.review`, `review.reviewer`, `level.review`, `campaign.brand`) | Opus | keep | reviewer: Sonnet 12/15, Haiku 10/15 |
| game-studio | `greenlight.tech_director` | Opus | keep | research: not benchmarked |
| game-studio | `engineering.tools_eng` | Sonnet | **Haiku** | coder: 15/15 |
| jev-agent | `act.coder` | Sonnet | keep | routed per request by Jev; calibrate the thresholds instead |
| jev-agent | `context.fallback` | Haiku | keep | already the cheapest; doc-writer and summarizer agree |
| legal-diligence | `risk.scorer` | Opus | **Sonnet** | planner (rule-driven judgement): 15/15 |
| legal-diligence | `review.consistency` | Opus | keep | reviewer: recall drops below Opus |
| marketing-studio | `research.icp`, `research.messaging` | Opus | **Sonnet** | writer: 15/15 |
| marketing-studio | `measurement.analyst` | Opus | keep | analysis: not benchmarked |
| marketing-studio | `content.writer`, `paid.creative` | Sonnet | keep | brand and policy checks; Haiku is a candidate if their pass rates hold |
| mobile-studio | `build.ios`, `build.android`, lane `native.*` | Opus | **Sonnet** | coder: 15/15; lane work is scoped by the contract |
| mobile-studio | `build.app_lead` | Opus | **Sonnet** | planner: 15/15 |
| mobile-studio | `release.resolve` | Opus | keep | research: not benchmarked |
| mobile-studio | `build.reviewer` | Sonnet | keep | reviewer: Haiku 10/15 vs Sonnet 12/15 |
| release-auditor | `finders.docs`, `finders.ux` | Opus | keep | finding work is reviewer work: only Opus holds 15/15 |
| release-auditor | `verify.verifier` | Opus | keep | reviewer: only Opus holds 15/15 |
| sales-pipeline | `analytics.analyst` | Opus | keep | analysis: not benchmarked |
| sales-pipeline | `analytics.winloss` | Opus | **Sonnet** | summarizer and writer: 6/6 and 15/15 (themes and quotes from closed deals) |
| sales-pipeline | `qualification.meddicc` | Sonnet | keep | a structured scorecard from a transcript: not benchmarked |
| social-studio | `strategy.strategist` | Opus | **Sonnet** | planner: 15/15 |
| social-studio | `creation.repurpose` | Sonnet | **Haiku** | writer, fitting an asset into platform specs: Haiku 15/15 |
| social-studio | `creation.copywriter` | Sonnet | keep | brand voice; Haiku is a candidate if the brand guard's scores hold |
| sre-incident | `investigation.investigator` | Opus | keep | diagnosis: not benchmarked; it has its own eval (signature accuracy) |
| sre-incident | `remediation.remediator` | Opus | keep | production fixes; the coder tasks are too small to stand in for its evals |
| sre-incident | `closeout.scribe` | Sonnet | **Haiku** | doc-writer: 6/6, mean 9.8 |
| web-studio | `design.ds` | Opus | keep | Figma edits: not benchmarked |
| web-studio | `discovery.ia` | Opus | **Sonnet** | planner: 15/15 |
| web-studio | `design.copy` | Sonnet | keep | three locales: translation not benchmarked |
| web-studio | `launch.monitor` | Haiku | keep | already the cheapest; summarizer agrees |

Switch: 29 node rows. Keep: 28, of which 11 are not benchmarked.
