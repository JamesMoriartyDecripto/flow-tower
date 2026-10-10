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

## Benchmark recipe

Same inputs, same loop, same prompts for every candidate. Log per call:

- `usage.cost` (OpenRouter returns it), `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens`;
- time to first byte, first content token, first tool call; total time; steps;
- correctness against the code/tower (expected answer written down before the run), failures and timeouts.

Never log request headers or keys.

| Role | Model | $ in / out per M | First useful output | Total | Steps | Cost / run | Cached % | Correct | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | illustrative, 1 run |
