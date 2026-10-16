# Tax advisor benchmark (commercialista)

Four task sets, two tasks each, for the roles of the commercialista tower. They run with the model benchmark in [`../../model-benchmark`](../../model-benchmark). The answer keys were written before any run and must not change: a changed key would move the goalposts after seeing the results.

| Set | Node (`ai-commercialista.tower.yaml`) | What it tests |
|---|---|---|
| `tasks/triage/` | `intake.triage` | Routes six items to `question`, `optimization_review`, `deadline_action` or `human_only`, failing closed when the engagement guard fails. |
| `tasks/abuse-label/` | `analysis.risk` | Labels proposals `green`, `amber` or `red` under art. 10-bis L. 212/2000, and sets `dac6`. |
| `tasks/citation-support/` | `verify.support` | Judges whether the cited text supports each claim, and no more. |
| `tasks/cited-answer/` | `analysis.researcher` | Answers only from two law files, with verbatim quotes checked by a script. |

## Run it

From the repository root. The commands are those of [the model benchmark](../../model-benchmark/README.md), with `--tasks` pointing at one of these folders and `--category` set to the same folder name (the runner keeps only the tasks of that category). One run per folder, each into its own results file.

```bash
cd examples/model-benchmark

# 1. Dry run: no key, no network. Checks every task file.
node scripts/bench.mjs --category triage --models vendor-a/model-x,vendor-b/model-y --tasks ../ai-commercialista/benchmark/tasks/triage/ --runs 3 --dry-run

# 2. Real run: the key from your shell only.
node scripts/bench.mjs --category triage --models vendor-a/model-x,vendor-b/model-y --tasks ../ai-commercialista/benchmark/tasks/triage/ --runs 3 --out results/2026-10-16-triage.jsonl

# 3. Judge: deterministic checks, then a blind sheet for the rubric.
node scripts/judge.mjs --in results/2026-10-16-triage.jsonl --tasks ../ai-commercialista/benchmark/tasks/triage/

# 4. Report.
node scripts/report.mjs --in results/2026-10-16-triage.judged.jsonl --out results/2026-10-16-triage.md
```

The `cited-answer` checks run as `command` judges: each one reads the answer with `verify-quotes.mjs`, and must find every quote verbatim in the fixture it names.

## Sources

The fixtures are verbatim Normattiva text, not the official law: the Gazzetta Ufficiale prevails. Both were retrieved on 2026-10-16.

- `fixtures/l212-2000-art10bis.txt`: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2000-07-27;212~art10bis
- `fixtures/l132-2025-art13.txt`: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2025-09-23;132~art13

The law texts stay in Italian: they are the sources.
