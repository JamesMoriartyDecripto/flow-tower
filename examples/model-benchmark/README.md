# Model Benchmark

How to pick a model per role on evidence: real tasks per category, one runner for every candidate, deterministic judges before a blind rubric, repeat runs, and a results table the maintainer signs off. It is the method behind [issue #105](https://github.com/JamesMoriartyDecripto/flow-tower/issues/105) (at least 5 recommended models per category in the `flow-tower-costs` skill), requested in [#108](https://github.com/JamesMoriartyDecripto/flow-tower/issues/108).

The folder is self-contained: copy it anywhere and it validates and runs (Node 22, no dependencies).

## What it shows

| Layer | What to decide there |
|---|---|
| Question & Categories | Which roles, and what would change a default. [categories.md](categories.md) |
| Task Sets | 2 real tasks per category, answer key written first, a check per task. [tasks/](tasks) |
| Candidates | Shortlist from the public price list; role and data-policy filters before price; an endpoint smoke test. [candidates.md](candidates.md) |
| Runner | One tool loop for all: session per run, effort low, `require_parameters`, `data_collection: deny`, 180 s timeout + one retry. [scripts/bench.mjs](scripts/bench.mjs) |
| Measurements | First output, total time, steps, tokens and cache, cost, errors, raw answer |
| Judges | Deterministic checks, then a blind verifier with a rubric. [scripts/judge.mjs](scripts/judge.mjs), [rubric.md](rubric.md) |
| Analysis | n, median and spread, cost per correct answer, warm vs cold cache, provider routing, retries. [scripts/report.mjs](scripts/report.mjs) |
| Outputs | Results table, sign-off, the skill update, defaults for towers and squads. [results/example.md](results/example.md) |

## Run it

```bash
node bin/flow-tower.js examples/model-benchmark     # open the tower
cd examples/model-benchmark

# 1. Dry run: no key, no network. Prints models × tasks × runs and checks every task file.
node scripts/bench.mjs --category reviewer --models vendor-a/model-x,vendor-b/model-y --tasks tasks/reviewer/ --runs 3 --dry-run

# 2. Real run: the key from your shell only (export it there; nothing reads a file for it).
node scripts/bench.mjs --category reviewer --models vendor-a/model-x,vendor-b/model-y --tasks tasks/reviewer/ --runs 3 --out results/2026-10-11.jsonl

# 3. Judge: deterministic checks, then a blind sheet for the rubric.
node scripts/judge.mjs --in results/2026-10-11.jsonl --tasks tasks/reviewer/
#    score results/2026-10-11.blind.md into results/2026-10-11.scores.json (0-10 per id), per rubric.md

# 4. Report: one table per category.
node scripts/report.mjs --in results/2026-10-11.judged.jsonl --scores results/2026-10-11.scores.json --out results/2026-10-11.md
```

Use the exact model ids that `node skills/flow-tower-costs/models.mjs --tools` prints in the Flow Tower repository on the day you run. Options: `--timeout <s>` (default 180), `--effort <low|medium|high>` (default low), `--url <tower url>`. `judge.mjs` takes several `--tasks` folders when one jsonl holds several categories.

To watch a run on the benchmark's own tower, open it (`node bin/flow-tower.js examples/model-benchmark`) and add `--url http://127.0.0.1:5317` to `bench.mjs` and `judge.mjs`: metadata only, never a prompt, an answer, a file or the key.

## Extend it

- **A task:** a Markdown file in `tasks/<category>/` with front matter (`check: command | json | regex | rubric`, optional `rubric: true`, `tools: read_file`, `files:` fixtures, `steps:`), a `## Prompt` (the only thing sent) and a `## Expected` (the key: a ```json block, ```regex and ```must-not blocks with one pattern per line, or a `command:` script that imports `answer.mjs` and exits 0 on success, plus the rubric points). Take it from real work: a bug that was fixed, a review that found something, a command people say. `--dry-run` rejects it until it is judgeable.
- **A category:** a folder in `tasks/`, a row in [categories.md](categories.md), a node in the Task Sets layer. Two tasks minimum before any run.
- **A model:** add its id to `--models`. Run one smoke run first: a listed model may have no endpoint under the data policy, and that is a result to record.

## How not to fool yourself

- **n.** One run is an anecdote. `report.mjs` labels a category ILLUSTRATIVE below 3 runs per model and task. Two models whose min-max ranges overlap are a tie until more runs separate them.
- **Variance.** Same model, same task: time and even correctness move between runs (sampling, provider, load). Compare medians; keep the spread in the table.
- **Cache warm-up.** Each run gets a fresh `session_id`, so step 1 is cold unless an earlier run left the prefix in the provider's cache. `cachedFirstStep` shows it: compare first runs with later ones before calling a model slow.
- **Provider routing.** One model id, several providers, different speed and quantization. The table lists who served each model; `provider.order` pins one only to explain a gap, and it turns sticky routing (and its cache) off.
- **Judge bias.** Deterministic checks first; the rubric only after, blind to the model name, scored by a family no candidate belongs to, twice in reverse order. Length is not quality.
- **Contamination.** Tasks from a public repo can be in training data. The planted bugs are new fixtures; retire a task every model always passes.
- **Cost of retries.** A timed-out call may still be billed. `$ / correct` counts every run, failed ones included, and retries sit next to it.
- **Same harness.** One prompt, one tool set, one step cap, one `max_tokens` for all. Tuning the prompt for one model measures the prompt.
- **Data policy.** Never drop `data_collection: deny` to get a model to run: "no endpoint under our policy" is the answer for that model.

## Sources

- [`skills/flow-tower-costs`](https://github.com/JamesMoriartyDecripto/flow-tower/tree/main/skills/flow-tower-costs): the checklist, the [benchmark recipe and field results](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/skills/flow-tower-costs/reference.md), and `models.mjs` for prices.
- Field results, 2026-10-10, one run each (illustrative): the six-model voice agent test (issue #70; qwen3.8-flash had no endpoint with zdr + `require_parameters`), and the dev squad on #70 (#75 findings: glm-5.3 timed out at 1-2.5 min per step, glm-5.3-flashx found the blocking bugs for $0.02-0.085; deepseek coder 90-95% of the prompt from cache). The runner's session, effort, timeout and retry choices come from that squad runner.
- Superseded on 2026-10-11 by the first full run and a squad field trial: see the [cost skill reference § Benchmark 2026-10-11](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/skills/flow-tower-costs/reference.md#benchmark-2026-10-11).
- [OpenRouter chat completions](https://openrouter.ai/docs/api-reference/chat-completion), [provider routing](https://openrouter.ai/docs/features/provider-routing) (`require_parameters`, `data_collection`), [prompt caching](https://openrouter.ai/docs/features/prompt-caching) and [usage accounting](https://openrouter.ai/docs/use-cases/usage-accounting).
- [Node.js permission model](https://nodejs.org/docs/latest-v22.x/api/permissions.html), used by `judge.mjs` to run model-written code.

Every number in [results/example.md](results/example.md) is invented to show the format: ILLUSTRATIVE.
