# Squad roles on the squad's own loop (2026-10-27, #322)

The dev squad kit (`tools/squad`, `flow-tower squad init`) measured on its own runner, not on a generic benchmark: the
coder through `steps.sh`, the reviewer and the security auditor through `run.mjs`, in the tool loop (`now` before
#322) and in one request with the code packed by `pack.mjs` (`relaxed`). 540 runs through OpenRouter, $1.22.

**Method.**
- **Project:** a small Node cart service (integer cents, `node --test`), set up with `flow-tower squad init` like any user project.
- **Expected answers first:** written before any run.
- **Reviews:** scored with the merge gate's own `parseVerdict` and `checkFinding`. A planted bug counts only when the verdict is `changes` and a finding whose quote the gate verifies sits on the bug's line. A clean diff counts only when approved with no critical or high finding.
- **Coder steps:** count when the step chain is green, its `Files:` contract is met, and an acceptance test the coder never saw passes.
- **Runs:** 2 per case. n = 12 per cell is enough to rank, not to settle.

## Coder

Six tasks, each one step of a real task file. Three plain ones (a coupon floor at zero, a sort that must not mutate the
cart, an inclusive threshold) and three hard ones (a CSV price list with a BOM, CRLF, quoted fields and line numbers in
the errors; Italian euro formatting without `Intl`; a 3-for-2 promotion over mixed SKUs, applied before the discount).

| Model | Passed (hidden tests) | Hard tasks | Median s | Median steps | $ / step |
|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 12/12 | 6/6 | 17 | 5 | 0.0010 |
| `anthropic/claude-haiku-5.5` | 12/12 | 6/6 | 11 | 4 | 0.0017 |
| `minimax/minimax-m3.1-flash` | 12/12 | 6/6 | 14 | 6 | 0.0018 |
| `deepseek/deepseek-v4.1-flash-1017` | 12/12 | 6/6 | 18 | 7 | 0.0022 |
| `qwen/qwen3.8-flash` | 12/12 | 6/6 | 55 | 9 | 0.0045 |
| `xiaomi/mimo-v2.6-flash` | 12/12 | 6/6 | 25 | 8 | 0.0053 |
| `google/gemini-3.8-flash` | 12/12 | 6/6 | 34 | 9 | 0.0222 |

Every model passed every task, so this set ranks on time and cost only. The default stays `anthropic/claude-haiku-5.5`:
the fastest, and the cleanest diff in the #126 field trial on a real refactor. `openai/gpt-6-luna` is the cheaper
alternative (`CODER_MODEL`). A set every model passes should be made harder before the next re-check.

## Reviewer

Three diffs with a planted bug (a coupon that can push the total below zero against its doc comment, a sort that
mutates the caller's cart against "returns a sorted copy", a free-shipping threshold that excludes the amount it
promises) and three clean ones (the real two-step change of the walkthrough below, a pure refactor, a small feature).

| Model | Mode | Correct | JSON | Bugs found | Clean approved | Median s | $/run (mean) | $/correct |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | relaxed | 12/12 | 12/12 | 6/6 | 6/6 | 2.3 | 0.0001 | 0.0001 |
| xiaomi/mimo-v2.6-flash | relaxed | 12/12 | 12/12 | 6/6 | 6/6 | 2.0 | 0.0004 | 0.0004 |
| z-ai/glm-5.3-flashx | relaxed | 12/12 | 12/12 | 6/6 | 6/6 | 2.0 | 0.0004 | 0.0004 |
| deepseek/deepseek-v4.1-flash-1017 | relaxed | 12/12 | 12/12 | 6/6 | 6/6 | 2.1 | 0.0009 | 0.0009 |
| google/gemini-3.8-flash | relaxed | 12/12 | 12/12 | 6/6 | 6/6 | 3.5 | 0.0012 | 0.0012 |
| google/gemini-3.8-flash | now | 12/12 | 12/12 | 6/6 | 6/6 | 11.2 | 0.0045 | 0.0045 |
| openai/gpt-6-luna | relaxed | 11/12 | 12/12 | 6/6 | 5/6 | 2.7 | 0.0002 | 0.0002 |
| qwen/qwen3.8-flash | relaxed | 11/12 | 12/12 | 6/6 | 5/6 | 10.0 | 0.0006 | 0.0007 |
| openai/gpt-6.1-terra | relaxed | 11/12 | 12/12 | 6/6 | 5/6 | 2.7 | 0.0015 | 0.0016 |
| xiaomi/mimo-v2.6-pro | now | 11/12 | 12/12 | 6/6 | 5/6 | 38.3 | 0.0023 | 0.0025 |
| minimax/minimax-m3.1-flash | relaxed | 10/12 | 12/12 | 6/6 | 4/6 | 2.6 | 0.0003 | 0.0004 |
| openai/gpt-6.1-terra | now | 10/12 | 12/12 | 6/6 | 4/6 | 4.4 | 0.0025 | 0.0030 |
| qwen/qwen3.8-flash | now | 10/12 | 11/12 | 5/6 | 5/6 | 78.2 | 0.0027 | 0.0033 |
| openai/gpt-6-luna | now | 9/12 | 9/12 | 4/6 | 5/6 | 3.1 | 0.0002 | 0.0003 |
| xiaomi/mimo-v2.6-pro | relaxed | 9/12 | 10/12 | 4/6 | 5/6 | 10.4 | 0.0007 | 0.0009 |
| xiaomi/mimo-v2.6-flash | now | 6/12 | 7/12 | 4/6 | 2/6 | 18.9 | 0.0063 | 0.0126 |
| minimax/minimax-m3.1-flash | now | 5/12 | 5/12 | 3/6 | 2/6 | 10.0 | 0.0010 | 0.0025 |
| z-ai/glm-5.3-flashx | now | 5/12 | 5/12 | 5/6 | 0/6 | 9.8 | 0.0011 | 0.0028 |
| z-ai/glm-5.3-flash | now | 4/12 | 4/12 | 4/6 | 0/6 | 10.5 | 0.0004 | 0.0011 |
| deepseek/deepseek-v4.1-flash-1017 | now | 4/12 | 4/12 | 3/6 | 1/6 | 7.6 | 0.0010 | 0.0031 |

`relaxed` is one request with the code packed; `now` was the tool loop. In the loop the cheap models answered prose
instead of the JSON verdict, mostly on clean diffs, where they had nothing to report: the runner's system prompt asked
every role for "your report ... end that report with a `Known gaps:` line", and they followed it over the task's
"Answer with JSON only". The gate can then never say READY. After #322 the reviewer and the security pass answer in one
request by default, and the loop's system prompt asks them for the verdict. With that prompt alone `z-ai/glm-5.3-flash`
answered the verdict on 6/6 clean loop runs (it was 0/6). A report without one is asked again once, then the run fails.

Default: `z-ai/glm-5.3-flash` (was `z-ai/glm-5.3-flashx`): the same score at a quarter of the price, same family, so the
coder, the reviewer and the security auditor still come from three families.

## Security

Three vulnerable diffs (a receipt download that joins a query-string id into a path, a payment call that logs the
provider key, a receipt printer that builds a shell command from a customer-typed name), two clean ones (the
walkthrough's change, the printer through `execFileSync` with no shell) and one written as clean by the case author: a
receipt download with an id format check. Most models flagged a real missing ownership check in it (any customer can
fetch any order's receipt), so it was scored as vulnerable.

| Model | Mode | Correct | JSON | Bugs found | Clean approved | Median s | $/run (mean) | $/correct |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | relaxed | 11/12 | 12/12 | 8/8 | 3/4 | 3.4 | 0.0002 | 0.0002 |
| xiaomi/mimo-v2.6-flash | relaxed | 11/12 | 11/12 | 7/8 | 4/4 | 8.5 | 0.0004 | 0.0004 |
| deepseek/deepseek-v4.1-flash | relaxed | 11/12 | 12/12 | 8/8 | 3/4 | 7.2 | 0.0011 | 0.0012 |
| deepseek/deepseek-v4.1-flash | now | 11/12 | 12/12 | 8/8 | 3/4 | 11.9 | 0.0017 | 0.0019 |
| deepseek/deepseek-v4.1-flash-1017 | relaxed | 11/12 | 12/12 | 8/8 | 3/4 | 9.3 | 0.0021 | 0.0023 |
| minimax/minimax-m3.1-flash | relaxed | 10/12 | 12/12 | 8/8 | 2/4 | 5.3 | 0.0006 | 0.0007 |
| z-ai/glm-5.3-flashx | relaxed | 10/12 | 12/12 | 7/8 | 3/4 | 3.5 | 0.0006 | 0.0007 |
| qwen/qwen3.8-flash | relaxed | 10/12 | 12/12 | 8/8 | 2/4 | 37.4 | 0.0014 | 0.0017 |
| z-ai/glm-5.3-flashx | now | 10/12 | 11/12 | 7/8 | 3/4 | 11.7 | 0.0014 | 0.0017 |
| google/gemini-3.8-flash | now | 10/12 | 12/12 | 6/8 | 4/4 | 28.0 | 0.0057 | 0.0068 |
| google/gemini-3.8-flash | relaxed | 9/12 | 11/12 | 5/8 | 4/4 | 18.7 | 0.0031 | 0.0038 |
| openai/gpt-6-luna | relaxed | 8/12 | 12/12 | 8/8 | 0/4 | 7.1 | 0.0002 | 0.0003 |
| openai/gpt-6-luna | now | 7/12 | 9/12 | 6/8 | 1/4 | 3.9 | 0.0003 | 0.0004 |
| z-ai/glm-5.3-flash | now | 7/12 | 8/12 | 5/8 | 2/4 | 7.2 | 0.0005 | 0.0008 |
| deepseek/deepseek-v4.1-flash-1017 | now | 7/12 | 9/12 | 6/8 | 1/4 | 14.5 | 0.0018 | 0.0031 |
| qwen/qwen3.8-flash | now | 6/12 | 9/12 | 6/8 | 0/4 | 120.3 | 0.0044 | 0.0088 |
| minimax/minimax-m3.1-flash | now | 5/12 | 7/12 | 5/8 | 0/4 | 9.3 | 0.0016 | 0.0037 |
| xiaomi/mimo-v2.6-flash | now | 3/12 | 4/12 | 1/8 | 2/4 | 38.7 | 0.0078 | 0.0312 |

Every model found the vulnerabilities; what separates them is false alarms on clean diffs, which block the gate as surely as
a real finding. Default stays `deepseek/deepseek-v4.1-flash`: 11/12 with all 8 vulnerable runs found, the third family
(`glm-5.3-flash` scores 11/12 too, but would put the reviewer and the auditor in one family), and its field history:
it found the real unchecked price of the walkthrough below. `deepseek-v4.1-flash-1017` scored the same here, slower and
dearer.

## Walkthrough: a fresh project, end to end

The proof that the kit works as shipped, on a project that had never seen it. It is repeatable with any small repo:

1. `flow-tower squad init cart-service`: it detected `npm run check`, `src` and `tests`, found the key in the user folder,
   and wrote the runner, the task template and the squad's tower.
2. Issue #12 of the sample (negative quantities and out-of-range discounts reach checkout), one task file, `steps.sh`:
   green in 3 coder steps, 7/7 tests, `Files:` contract met, $0.0014.
3. Review and security together. The security pass found a real medium issue and quoted its line: `src/cart.js:10`
   multiplied an unchecked `priceCents`, so a negative unit price lowered the total. The lead checked it in the code and
   kept it.
4. A fix step: green, 10/10 tests, $0.0012. Review and security on the new commit: security approved.
5. `node tools/squad/cost.mjs 12`: **$0.0121** for the whole issue, 6 runs, 23 steps.

The reviewer of that run (`glm-5.3-flashx`, tool loop) answered prose twice instead of the verdict, so the gate would
have said NOT READY: the defect this page measured and #322 fixed.
