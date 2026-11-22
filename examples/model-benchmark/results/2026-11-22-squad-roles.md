# Squad roles on real pull requests (2026-11-22, #447)

The squad's five model defaults measured again, on the squad's own runner and on real review rounds of this repository. The 2026-10-27 cases ([squad roles](2026-10-27-squad-roles.md)) were small planted bugs: every coder passed every task and five reviewers scored 12 of 12, so they could not rank the models, and they never showed the empty answers the field ledger had.

**Decision (maintainer, 2026-11-22):** for the roles that decide what is merged (reviewer, security, lead-judge), rank on defects found first, failed runs second, false alarms third, cost last.

| Role | Before | Now | Why |
|---|---|---|---|
| Reviewer | `z-ai/glm-5.3-flash` | `minimax/minimax-m3.1-flash` | saw 7 of 12 kept defects (GLM: 4) and raised no critical or high finding on a clean head |
| Security | `deepseek/deepseek-v4.1-flash` | `minimax/minimax-m3.1-flash` | 0 failed runs in 24 (DeepSeek: 3 in 16, empty answers), 6 of 12 defects seen |
| Lead-judge | `anthropic/claude-sonnet-5.5` | `google/gemini-4-carbon` | 18 of 18 keep/drop sets right (Sonnet: 15 of 18) |
| Architect | `openai/gpt-6.1-terra` | unchanged | 9 of 9, tied with Gemini 3.8 Flash and cheaper |
| Coder | `anthropic/claude-haiku-5.5` | unchanged | not measured here; 4 failed runs in 989 in the field ledger |
| Researcher, verifier | followed the reviewer | `z-ai/glm-5.3-flash`, their own default | not measured; they keep the model they ran on |

Reviewer and security on one model breaks the three-family rule. In this data the extra defects come from more passes of different models, not from one model per role being of another family (#450).

## Method

- **Cases:** four real pull requests (#347, #353, #357, #444), each as a defect case and a clean case, at their real size (110-150 KB packed by `pack.mjs`). Keys are the findings the lead kept and a later step fixed. Set and corrections: [tasks/squad-review](../tasks/squad-review/README.md).
- **Runs:** each packed task through `tools/squad/run.mjs` in one request, as the squad sends it, by [scripts/squad-roles.mjs](../scripts/squad-roles.mjs), scored with the merge gate's own `parseVerdict` and `checkFinding` ([scripts/squad-score.mjs](../scripts/squad-score.mjs)). Effort low, as the squad runs.
- **Columns:** *Key seen* is a defect case where a finding sits on a key's file and matches its pattern, at any severity. *Key blocked* is the same with a critical or high finding. *Clean not blocked* is a clean head with no critical or high finding. *Pass* is the strict gate rule of the day: `changes` on a defect case with a key found, `approve` with no critical or high finding on a clean case.
- **Loop roles:** the planner and judge tasks of [2026-10-31](2026-10-31-lead.md), through `run.mjs` in its tool loop, by [scripts/squad-loop.mjs](../scripts/squad-loop.mjs), checked by `scripts/judge.mjs`.
- **n:** two runs per case for every model, a third for the finalists; the top tier (Opus 5.5, Sonnet 5.5, Gemini 4 Carbon and Neon) one run. Gaps under 3 runs are ties.

## Reviewer

| Model | Pass | Key seen | Key blocked | Clean not blocked | Failed runs | Median s | $/run |
|---|---|---|---|---|---|---|---|
| `minimax/minimax-m3.1-flash` | 9/24 | **7/12** | 4/12 | 12/12 | 0 | 32 | 0.0125 |
| `anthropic/claude-haiku-5.5` | 8/24 | 7/12 | 3/12 | 4/12 | 0 | 9 | 0.0077 |
| `openai/gpt-6.2-sol` | 6/16 | 6/8 | 4/8 | 2/8 | 0 | 9 | 0.1053 |
| `meta/muse-ember` | 15/24 | 5/12 | 4/12 | 12/12 | 0 | 11 | 0.0055 |
| `tencent/hy4-flash` | 9/24 | 5/12 | 4/12 | 7/12 | 3 cut | 95 | 0.0036 |
| `z-ai/glm-5.3-flash` (before) | 12/24 | 4/12 | 0/12 | 11/12 | 1 | 16 | 0.0056 |
| `openai/gpt-6.1-terra` | 4/16 | 4/8 | 4/8 | 2/8 | 0 | 11 | 0.0515 |
| `google/gemini-4-carbon` | 5/8 | 3/4 | 0/4 | 4/4 | 0 | 22 | 0.1253 |
| `deepseek/deepseek-v4.1-flash` | 2/16 | 2/8 | 1/8 | 4/8 | 9 empty or cut | 207 | 0.0330 |
| `anthropic/claude-opus-5.5` | 2/8 | 1/4 | 0/4 | 4/4 | 0 | 17 | 0.3116 |
| `anthropic/claude-sonnet-5.5` | 1/8 | 1/4 | 0/4 | 2/4 | 1 | 9 | 0.1514 |
| `google/gemini-3.8-flash` | 8/16 | 0/8 | 0/8 | 8/8 | 0 | 3 | 0.0233 |

GLM 5.3 Flash's 12 of 24 is the score of approving everything: it asked for changes on 4 of 12 defect cases and reported a kept defect as blocking in none. Gemini 3.8 Flash returned no finding in 16 runs.

## Security

| Model | Pass | Key seen | Key blocked | Clean not blocked | Failed runs | Median s | $/run |
|---|---|---|---|---|---|---|---|
| `minimax/minimax-m3.1-flash` | 14/24 | 6/12 | 2/12 | 12/12 | 0 | 22 | 0.0084 |
| `anthropic/claude-haiku-5.5` | 8/24 | 7/12 | 0/12 | 11/12 | 0 | 7 | 0.0074 |
| `thinkingmachines/inkling-2-mini` | 16/24 | 6/12 | 0/12 | 12/12 | 0 | 24 | 0.0044 |
| `deepseek/deepseek-v4.1-flash-1017` | 11/16 | 5/8 | 2/8 | 8/8 | 0 | 60 | 0.0138 |
| `deepseek/deepseek-v4.1-flash` (before) | 9/16 | 4/8 | 1/8 | 7/8 | 3 | 108 | 0.0206 |
| `openai/gpt-6.2-sol` | 4/16 | 4/8 | 2/8 | 8/8 | 0 | 5 | 0.1026 |
| `z-ai/glm-5.3-flash` | 12/24 | 7/12 | 0/12 | 12/12 | 0 | 8 | 0.0052 |
| `meta/muse-ember` | 14/24 | 4/12 | 0/12 | 12/12 | 0 | 10 | 0.0049 |
| `anthropic/claude-opus-5.5` | 4/8 | 1/4 | 0/4 | 4/4 | 0 | 9 | 0.2941 |

Most models see the security defects at some severity and call them medium or low. `deepseek-v4.1-flash-1017` had no failed run in 16 and is the closest second: more runs would settle it.

## Lead-judge

| Model | Pass | Wrong decision | Not plain data | No answer | Median s | $/set |
|---|---|---|---|---|---|---|
| `google/gemini-4-carbon` | **18/18** | 0 | 0 | 0 | 33 | 0.0478 |
| `anthropic/claude-sonnet-5.5` (before) | 15/18 | 0 | 3 | 0 | 15 | 0.0347 |
| `qwen/qwen4-max` | 7/9 | 0 | 0 | 2 | 171 | 0.0394 |
| `google/gemini-4-neon` | 6/9 | 3 | 0 | 0 | 21 | 0.0524 |
| `z-ai/glm-5.3` | 4/9 | 1 | 4 | 0 | 21 | 0.0178 |
| `anthropic/claude-fable-5.2` | 4/9 | 5 | 0 | 0 | 33 | 0.2048 |
| `anthropic/claude-opus-5.5` | 3/9 | 6 | 0 | 0 | 21 | 0.0663 |
| `openai/gpt-6.1-terra` | 0/6 | 6 | 0 | 0 | 13 | 0.0134 |
| `openai/gpt-6.2-astra` | 0/9 | 0 | 9 | 0 | 7 | 0.0936 |

The check stops at the first failure, so a set that is not plain data is not read for its decisions: one of Sonnet's three also dropped the critical finding of #347. Opus, Fable and Terra drop the security findings as out of scope, the mistake the judge task was written to catch.

## Architect

| Model | Pass | Wrong plan | Not plain data | No answer | Median s | $/plan |
|---|---|---|---|---|---|---|
| `openai/gpt-6.1-terra` (kept) | 9/9 | 0 | 0 | 0 | 22 | 0.0222 |
| `google/gemini-3.8-flash` | 9/9 | 0 | 0 | 0 | 24 | 0.0242 |
| `openai/gpt-6.2-sol` | 8/9 | 0 | 1 | 0 | 17 | 0.0348 |
| `google/gemini-4-carbon` | 6/6 | 0 | 0 | 0 | 47 | 0.0813 |

## The verdict rule

On clean heads, 62 of 97 failed reviews were a `changes` verdict whose findings were all medium or low: the pack never said when to answer `changes`, and the gate blocks on it. MiniMax as reviewer approved 2 of 12 clean heads for that reason alone. The pack now says it (#449): `changes` only for a critical or high finding.

Measured after the change: MiniMax on both roles, the same 8 cases, 2 runs, with the packs carrying the new line (32 runs, $0.37).

| Role | Prompt | Approve on a clean head | Changes on a defect head | Key seen | Key blocked | Failed runs |
|---|---|---|---|---|---|---|
| Reviewer | before | 2/12 | 9/12 | 7/12 | 4/12 | 0 |
| Reviewer | after | **6/8** | 3/8 | 4/8 | 2/8 | 1 cut |
| Security | before | 8/12 | 10/12 | 6/12 | 2/12 | 0 |
| Security | after | **8/8** | 4/8 | 6/8 | 2/8 | 0 |

The rule does what it is for: the reviewer approves a clean head 6 times in 8 instead of 2 in 12, so the gate stops blocking on medium notes. The defects found move within the noise of 8 runs. The trade-off is plain: a defect reported as medium no longer blocks the gate. The lead reads every finding either way, and a block now means a critical or high finding. One reviewer answer was cut at the token cap, and one clean head got a high finding.

## Limits

- One to three runs per cell. The table ranks; it does not settle close calls.
- Four pull requests of one repository, all in TypeScript and shell.
- The keys are the findings one lead kept. Two of eight case keys were corrected from the code after the first round ([corrections](../tasks/squad-review/README.md)); 336 stored answers were scored again and 48 runs of a case packed against the wrong base were thrown away and run again.
- Effort low for every role. Whether a higher effort changes the ranking is #451.
- No single pass sees more than 7 of the 12 kept defects. Four or six passes of different models saw 7 to 10 (#450).

## Cost

| Part | Runs | Cost |
|---|---|---|
| Reviewer and security, scored | 672 | $24.71 |
| A case packed against the wrong base, thrown away | 48 | $0.73 |
| The verdict rule, measured after | 32 | $0.37 |
| Lead-judge | 126 | $6.67 |
| Architect | 69 | $2.53 |
| Smoke test | 12 | $0.16 |
| **Total** | **959** | **$35.17** |

OpenRouter only. The agents that wrote, checked and judged the benchmark ran on the lead's own harness and are not counted.

## Raw data

[2026-11-22-squad-roles.jsonl](2026-11-22-squad-roles.jsonl) holds every scored review run with its answer, [2026-11-22-squad-roles-verdict-rule.jsonl](2026-11-22-squad-roles-verdict-rule.jsonl) the runs after the verdict rule, and [2026-11-22-lead/](2026-11-22-lead) the lead-judge and architect runs. Local paths are replaced with `<local>`.
