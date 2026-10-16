# Tower optimizer: before/after

## ai-commercialista.tower.yaml — AI Commercialista (Italy)

### Findings fixed

| rule | node | level | message |
| --- | --- | --- | --- |
| AUD02 | analysis.scanner | warning | fan-out with no limits: add limits.concurrency or limits.timeout |
| AUD05 | analysis.risk | info | feeds output with no evals: add evals to measure the answer |
| AUD07 | deliver.filing | info | no outgoing edge: connect it, or make it the target of a call |

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 7 | 7 | 0 |
| nodes | 33 | 34 | +1 |
| edges | 40 | 42 | +2 |
| agents | 6 | 6 | 0 |
| withOps.budget | 6 | 6 | 0 |
| withOps.limits | 1 | 2 | +1 |
| withOps.approval | 2 | 2 | 0 |
| withOps.evals | 1 | 4 | +3 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

| node | role | model |
| --- | --- | --- |
| analysis.researcher | orchestrator → research | claude-sonnet-5-5 → claude-haiku-5-5 |
| verify.support | writing | claude-opus-5-5 → gpt-6-luna |

## towers/sources.tower.yaml — Sources sync

### Findings fixed

_none_

### Findings new

_none_

### Findings still open

_none_

### Inventory

| counter | before | after | delta |
| --- | --- | --- | --- |
| layers | 4 | 4 | 0 |
| nodes | 16 | 16 | 0 |
| edges | 19 | 19 | 0 |
| agents | 0 | 0 | 0 |
| withOps.budget | 0 | 0 | 0 |
| withOps.limits | 0 | 0 | 0 |
| withOps.approval | 0 | 0 | 0 |
| withOps.evals | 0 | 0 | 0 |
| withOps.sandbox | 0 | 0 | 0 |

### Model changes

_none_


## Proposals applied

Approved one by one by the maintainer, each validated on a copy before it was shown:

- **P1 `analysis.scanner` (AUD02, warning):** `limits: { concurrency: 8, timeout: 2m }`. These caps are illustrative, because the example ships no runtime code to take them from.
- **P2 `intake.triage` (rubric line 3, warning):** the `read_profile` tool was removed. The triage must never read the profile, which is not redacted yet at that point. The link label now says "client id and route".
- **P3 `intake.redact_text` (rubric line 7, warning):** the raw client question reached the triage model before any redaction. A guard now pseudonymizes the question text first (`scripts/redact.mjs`), and the triage agent's data sensitivity drops from `pii` to `confidential`.
- **P4 evals (AUD05, info):** measured evals on `analysis.risk`, `verify.support` and `analysis.researcher`, from the benchmark below. The targets are illustrative.
- **P5 `deliver.filing` (AUD07, info):** a link `filing -> memory.audit` for the filing receipt.
- **P6 tracing (rubric line 5, info):** `match: ["agent:<id>"]` on the six agents, so live events light their nodes.
- **P7 pattern (rubric line 1, info):** the lever list comes from code (`build_profile.mjs`), so `data.redact` spawns the scanner copies, not the researcher (Sonnet). The researcher answers questions only.

Pattern review (rubric), quotes checked with `check-quotes.mjs` (7 kept, 0 dropped):
- **Line 1:** the pattern is prompt chaining, plus fan-out per lever, plus an evaluator loop (gate → drafter, max 2). P7 removed the one model-driven orchestration step that code already did.
- **Line 6:** nothing found. No agent acts on the world, and filing and signature stay with people.

## Benchmark and model changes

The tower's own task sets (`examples/ai-commercialista/benchmark/tasks/`, answer keys written before the run) were run on 6 models, 3 runs per task, through OpenRouter on 2026-10-16. The run cost $0.43 in total, and the result tables are in `examples/ai-commercialista/benchmark/results/`. The rule set by the maintainer: same result, then the lowest cost per correct answer and/or the fastest, across providers.

| node | role | before | after | correct | $ / correct | why |
|---|---|---|---|---|---|---|
| `intake.triage` | triage | Haiku 5.5 | Haiku 5.5 | 6/6 | $0.0000 | all 6 models tied; Haiku the cheapest |
| `analysis.risk` | abuse-of-law label | Haiku 5.5 | Haiku 5.5 | 6/6 | $0.0003 | Haiku the cheapest among the five at 6/6 (GPT-6 Luna 5/6: missed a DAC6 flag) |
| `verify.support` | citation support | Opus 5.5 | GPT-6 Luna | 6/6 | $0.0001 | fastest and cheapest at 6/6; Haiku 0/6, since it accepts claims the text does not state |
| `analysis.researcher` | answers quoted verbatim | Sonnet 5.5 | Haiku 5.5 | 6/6 | $0.0007 | Sonnet 5/6 at $0.016. DeepSeek 4.1 Flash is also 6/6 but at $0.0012, with no Citations API, which the node is built on |

- **Not benchmarked yet:** `analysis.scanner` and `analysis.drafter` stay on Sonnet, because they have no task set yet.
- **Support check and data:** the support check now sends client data to a second processor (OpenAI). The new `openai` runtime says that a DPA and the data region must be confirmed before production use.
- **Judge bug:** on Node 24 the judge counted every `check: command` run as a fail (#256, fixed in #257). The cited-answer runs were re-judged with the fixed judge.
- **Widened check:** after the run, the "no fine" rule of `ai-in-the-studio` was widened because it rejected correct wordings such as "Neither file sets a fine". The expected answer did not change.
- **Sample size:** the sample is small (2 tasks × 3 runs per role) and every check is deterministic.

## Squad review

GLM 5.3 FlashX, one oneshot pass, $0.0068 (issue #231). It raised six points; none was applied, each checked in the code:
- "Empty diff": the packed diff was not empty.
- **Two `registry` nodes:** they are in different layers, and ids are layer-qualified (`data.registry`, `sources.registry`), as the validator accepts.
- **`opt()` with no value, PIVA vs PHONE order:** these are a local operator script's edge cases. The pattern order already decides the PIVA/PHONE precedence.
- **The sentence split breaking amounts:** tested, it does not. `€1.000` and `EUR 1.000,00` are caught as amounts, since the split needs a space after the stop.
- **The tower file is 428 lines:** this is over the ~400 guideline, and is kept that way, as in the other example towers (several are over 700).
