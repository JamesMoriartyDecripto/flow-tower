# flow-tower-costs: reference

## Levers

- **Prompt caching.** Automatic on OpenRouter for DeepSeek, OpenAI, Z.ai, Grok and Gemini 2.5+ (implicit); Anthropic needs `cache_control` breakpoints. Cached reads cost ~0.1–0.25x input. Keep a stable prefix: system prompt, tools, task first, append-only history. Pin a `session_id` per run so OpenRouter's sticky routing keeps the provider that holds the cache; sessions expire after 10 min idle; `provider.order` disables sticky routing.
- **Reasoning effort.** `reasoning: { effort: 'low' }` for roles whose work is re-checked downstream (coder checked by a reviewer, drafts checked by tests).
- **Smaller tasks.** Smaller task per call, step caps (`max_turns`), `max_tokens` on every call.
- **Parallel tools.** Ask for tools called together in one step: fewer round trips, fewer re-sent prompts.
- **Escalation.** Cheap default; escalate to a strong model only on the last fix round or after a failed check.
- **Batch.** `:batch` variants (or provider batch APIs) for offline work.
- **Timeouts.** Per-call timeout + one retry: a stuck step costs time and money.
- **Fewer agent turns.** A local parser for commands, the LLM only for questions.
- **Fixed outputs.** Cached audio / phrases for fixed outputs (acknowledgements, greetings).
- **Constraints.** ZDR and `provider: { data_collection: 'deny' }` shrink the candidate list: apply them before shortlisting, not after.

## Benchmark 2026-10-11

flow-tower, 2026-10-11 to 2026-10-12: 8 models × 5 categories × 2 tasks × 3 runs = 240 runs, $0.19 total, OpenRouter (`data_collection: deny`), effort low, cold cache. Method and full tables: [results/2026-10-11.md](../../examples/model-benchmark/results/2026-10-11.md).
ILLUSTRATIVE-ish: n = 6 per model per category; overlapping ranges are ties.
Rubric scored blind by Claude (a candidate family: provisional) and MiniMax M3 (not in the race); within 2 points: doc-writer 27/33, reviewer 22/22, security 38/38; disagreements keep the lower score.
Fastest and cheapest acceptable count only models with ≥ 4/6 (reviewer ≥ 3/6). Columns: correct/n, $ per run, median total seconds.

**intent** (all 8 models 6/6: accuracy ties)

| Label | Model | Correct | $/run | s |
|---|---|---|---|---|
| best value | gpt-6-luna | 6/6 | $0.0001 | 1.4 |
| fastest | gemini-3.5-flash-lite | 6/6 | $0.0003 | 0.8 |
| most accurate (all tie) | glm-5.3-flashx | 6/6 | $0.0002 | 1.5 |
| cheapest acceptable | mercury-2.5 | 6/6 | $0.0001 | 2.0 |
| alternative family | claude-haiku-5.5 | 6/6 | $0.0001 | 1.9 |

**doc-writer**

| Label | Model | Correct | $/run | s |
|---|---|---|---|---|
| best value | claude-haiku-5.5 | 6/6 | $0.0001 | 2.1 |
| most accurate (tie) | deepseek-v4.1-flash | 6/6 | $0.0002 | 1.9 |
| fastest, cheapest acceptable | gpt-6-luna | 5/6 | $0.0001 | 1.3 |
| alternative family | mercury-2.5 | 4/6 | $0.0001 | 1.3 |
| next (fastest overall) | gemini-3.5-flash-lite | 3/6 | $0.0003 | 1.0 |

**coder** (single-step, no tools: the field trial below decided the squad coder)

| Label | Model | Correct | $/run | s |
|---|---|---|---|---|
| best value, fastest, cheapest acceptable | mercury-2.5 | 6/6 | $0.0001 | 2.2 |
| most accurate (tie) | claude-haiku-5.5 | 6/6 | $0.0005 | 5.8 |
| alternative family | gpt-6-luna | 6/6 | $0.0003 | 5.9 |
| next | glm-5.3-flashx | 4/6 | $0.0005 | 2.7 |
| previous squad default | deepseek-v4.1-flash | 3/6 | $0.0018 | 17.2 |

**reviewer** (events-204: 1 of 24 runs passed; models miss the project rule that Claude Code reads a JSON body from an HTTP hook as a hook decision, so a reviewer prompt must state such rules)

| Label | Model | Correct | $/run | s |
|---|---|---|---|---|
| best value, fastest, cheapest acceptable | gemini-3.5-flash-lite | 3/6 | $0.0006 | 1.8 |
| most accurate | deepseek-v4.1-flash | 4/6 | $0.0026 | 14.9 |
| alternative family (squad default) | glm-5.3-flashx | 3/6 | $0.0010 | 11.1 |
| tie | claude-haiku-5.5 | 3/6 | $0.0008 | 7.8 |
| avoid | gpt-6-luna | 0/6 | $0.0003 | 7.8 |

**security** (4 models at 6/6; the rubric is lenient: 36/38 rubric answers passed)

| Label | Model | Correct | $/run | s |
|---|---|---|---|---|
| best value, fastest | gpt-6-luna | 5/6 | $0.0003 | 8.0 |
| cheapest acceptable | qwen3.7-flash | 5/6 | $0.0003 | 20.6 |
| most accurate (tie) | claude-haiku-5.5 | 6/6 | $0.0010 | 11.1 |
| most accurate (tie, squad default) | deepseek-v4.1-flash | 6/6 | $0.0012 | 8.8 |
| alternative family | glm-5.3-flashx | 6/6 | $0.0012 | 12.4 |

**Field trial, squad coder**: issue #126 (split `bin/flow-tower.js`), one worktree per coder, all green and behaviour-identical to main.

| Coder | Time | Steps | Cost | bin lines (goal < 450) |
|---|---|---|---|---|
| gpt-6-luna | 67 s | 11 | $0.005 | 465 (missed) |
| mercury-2.5 | 119 s | 13 | $0.007 | 471 (missed) |
| claude-haiku-5.5 | 212 s | 11 | $0.016 | 426 (met, cleanest; cache 86% with `cache_control`) |
| deepseek-v4.1-flash | 337 s | 36 | $0.048 | 446 |

Reviewers on that PR: glm-5.3-flashx 3 steps, $0.007, found the main issue; deepseek-v4.1-flash 16 steps, $0.058, the same issue plus one (an earlier try hit its step cap); gemini-3.5-flash-lite 2 steps, $0.002, approved with no finding (missed the main issue). GLM stays the reviewer: the benchmark tie at 3/6 broke on real work.

**Defaults since 2026-10-11** (three families):
- Coder `anthropic/claude-haiku-5.5`: met the goal in the field trial, cleanest diff, a third of deepseek's cost; `openai/gpt-6-luna` is the cheap, fast fallback for simple tasks.
- Reviewer `z-ai/glm-5.3-flashx` (kept: cheapest field reviewer that found the issue); security `deepseek/deepseek-v4.1-flash` (6/6, fastest of the 6/6 models).
- Voice agent stays `google/gemini-3.5-flash-lite`: the voice category was not rerun.

Caveats: some doc-writer regex checks are lenient (a fix under Added passed; `### Unreleased` passed). Cache was 0% for most models: 300–600-token prompts are below most providers' minimum, and Anthropic needs `cache_control`; #149 adds `--warm`, `--batch` and `cache_control`.

## Field results

flow-tower, 2026-10-10. Illustrative: one run each.

**a) Voice agent**, 6 models on the real tool loop, time to first real sentence ([examples/voice-commands/options/llm-intent.md](../../examples/voice-commands/options/llm-intent.md)):

| Model | First sentence | Result | $ in / out per M |
|---|---|---|---|
| gemini-3.5-flash-lite | 1.80 s | all right, 2 steps | 0.30 / 2.50 |
| claude-haiku-5.5 | 2.28 s | one wrong count | 0.10 / 0.50 |
| gemini-3.1-flash-lite (previous default) | 2.38 s | | 0.25 / 1.50 |
| mercury-2.5 | 4.0 s | one unanswered | 0.04 / 0.15 |
| gpt-6-luna | 4.74 s | markdown in spoken replies | 0.10 / 0.50 |
| qwen3.8-flash | none | no endpoint with zdr + require_parameters | |

Lesson: the cheapest were the slowest or failed. A cached spoken acknowledgement took first audio from 1.9–2.9 s to 0.6 s at near-zero cost.

**b) Dev squad, mixed models on issue #70** ([examples/dev-squad/README.md § Mixed models](../../examples/dev-squad/README.md#mixed-models)):

- Coder: deepseek-v4-pro, 50 steps, $0.13; then deepseek-v4.1-flash ~$0.07 per fix round; 90–95% of the prompt from cache.
- Reviewer: glm-5.3 timed out (1–2.5 min per step, $0.24 wasted) → glm-5.3-flashx, 4–6 steps, $0.02–0.085, found the blocking bugs.
- Security: deepseek flash, $0.04–0.06.
- Whole issue: about $0.65 on OpenRouter; lead and verifier on Claude.
- Superseded 2026-10-11: the coder default is now claude-haiku-5.5 ([Benchmark 2026-10-11](#benchmark-2026-10-11)).

## Benchmark recipe

Same inputs, same loop, same prompts for every candidate. Log per call:

- `usage.cost` (OpenRouter returns it), `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens`;
- time to first byte, first content token, first tool call; total time; steps;
- correctness against the code/tower (expected answer written down before the run), failures and timeouts.

Never log request headers or keys.

| Role | Model | $ in / out per M | First useful output | Total | Steps | Cost / run | Cached % | Correct | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | illustrative, 1 run |
