# Repeated Dev Squad + defensive cyber pilot — #105

Status: experiments complete, recommendations provisional, defaults unchanged. PR #340. Public synthetic tasks
only; no scanning or interaction with real targets. Three repetitions per task/model, sequential actual squad
runner, fixed task prompts, cold/warm cache uncontrolled, grouped ordering. This is a small-task pilot, not a
production reliability certification or five recommendations per category. Lead cost excluded.

## Accounting and validity

- Nine-role repeated matrix: 174 runs, $0.141232 reported.
- First cybersecurity matrix: 72 runs, $0.094286 reported, **INVALID for intended scoped comparison**.
  Threat-model prose was above ## Prompt and therefore omitted from transmitted text. All results retained,
  no selective deletion. Some extra findings were legitimate under a broader interpretation; do not count
  them as false positives or model failures for the intended scope. One Gemini SQL run lacked a valid verdict.
- Corrected frozen cybersecurity matrix at 950f217: 72 fresh runs, $0.081554 reported. Threat scopes are now
  inside the actual prompt; this version alone supports the scoped results below.
- Preparation: four specialist runs, $0.018601 reported. Total new pilot ledger spend **$0.335673** so far,
  before further review. No unknown-cost records in completed run ledgers. One driver was interrupted midcall
  by shell timeout during the first cyber matrix; any abandoned in-flight charge is not reconciled to these
  completed ledgers. Do not treat this total as the final invoice or claim exact all-in spend.

## Cybersecurity results

Four paired families: SQL injection vs bound values; shell interpolation vs fixed printf argv; privileged
model-tool execution influenced by repository instructions vs deterministic denial; credential environment
forwarding vs allowlisted child environment. Each had three vulnerable + three safe repetitions per model
(12 vulnerable and 12 clean). The safe threat scopes deliberately exclude unrelated availability/filesystem
claims; this tests scoped auditing, not whole-program security.

| Model | Vulnerable cases detected | Clean controls accepted empty | Valid verdicts | Cost (24 runs) | Median wall s |
|---|---:|---:|---:|---:|---:|
| DeepSeek v4.1 Flash | 12/12 | 12/12 | 24/24 | $0.018445 | 3.4 |
| GLM 5.3 Flash | 12/12 | 12/12 | 24/24 | $0.001440 | 3.5 |
| Gemini 3.8 Flash | 12/12 | 12/12 | 24/24 | $0.061669 | 11.5 |

All nonempty finding quotes matched the supplied code after whitespace normalization. This is not independent
proof of semantic impact, correct file:line or a successful remediation. The cyber schema still uses separate
file/line fields rather than the merge gate's file:line string: verdict parsing works but strict gate finding
validation parity is not established. No real malicious-document execution/secret escape was attempted; these
are code-audit fixtures, not an adversarial agent-runtime penetration test.

GLM was ~12.8× cheaper than DeepSeek and ~42.8× cheaper than Gemini on this scoped population, with comparable
median wall latency to DeepSeek. These are measured task costs, not advertised token prices. Prompt precision
materially changed results: don't generalize the earlier invalid-scope false-alarm counts to these models.

## Repeated squad-role outcomes

Each role/model has six runs (two small tasks × three repeats). "Checks" means protocol + narrow deterministic
criteria; researcher/architect/triage/docs still lack completed blind semantic rubric scoring. Not quality scores.
Coder checks include independent tests and unchanged test/docs files. Tester/verifier completion alone does
not prove the tools were used honestly: raw tool logs need rubric/evidence review before production selection.

| Role | Model | Checks | Six-run cost | Median wall s |
|---|---|---:|---:|---:|
| triage | Haiku / GLM / Luna | 6/6 each | .005657 / .001380 / .002326 | 11.1 / 13.5 / 8.6 |
| architect | GLM / Haiku / Luna / Gemini | 6/6 each | .002232 / .007602 / .003318 / .028865 | 11.4 / 12.2 / 12.0 / 15.1 |
| researcher | GLM / DeepSeek / MiniMax | 6/6 each* | .001141 / .009255 / .005318 | 8.6 / 13.6 / 9.0 |
| coder | Haiku / Luna / MiMo / Qwen | 6/6 / 6/6 / 6/6 / 4/6 | .004554 / .003526 / .004037 / .007337 | 7.5 / 10.0 / 14.9 / 38.0 |
| tester | Haiku / GLM / Luna | 6/6 each | .003074 / .000960 / .001644 | 4.3 / 5.4 / 5.9 |
| reviewer | GLM / DeepSeek / Gemini | 5/6 / 6/6 / 6/6 | .000488 / .006472 / .011937 | 4.7 / 6.6 / 5.4 |
| security | DeepSeek / GLM / Gemini | 6/6 each | .003836 / .000477 / .010856 | 3.7 / 3.2 / 10.2 |
| verifier | GLM / Haiku / Luna | 6/6 each | .000912 / .003634 / .001739 | 5.2 / 5.8 / 6.3 |
| doc-writer | Haiku / GLM / MiMo | 6/6 / 6/6 / 5/6 | .003964 / .001628 / .003063 | 5.6 / 6.3 / 11.4 |

*Prior smoke research factual errors remain disqualifying evidence until explicitly reassessed on blinded tasks;
green protocol gates do not erase them. Qwen exhausted its five-step limit twice; MiMo doc writer once.
GLM again emitted nonempty findings for a clean reviewer control (one of three repetitions).

## What to use next, not automatic default changes

- Coder: Luna best observed cost among six-test survivors; Haiku faster (7.5s vs 10.0s median). Retain both
  choices; Qwen has no demonstrated value advantage here and two exhausted runs.
- Tester/verifier: GLM is a low-cost candidate; audit evidence and increase task diversity before finalizing.
- Reviewer: prefer investigating DeepSeek as value candidate; GLM repeatedly over-reports on clean controls.
  Gemini is an escalation/quality-control candidate, not justified everywhere by this sample.
- Security: GLM is very promising on precisely scoped cases. Retain independent review and do not infer
  broad cybersecurity superiority from four familiar bug families. Add subtle authorization, dataflow and
  dependency fixtures before selecting a production default solely on cost.
- Research/architecture/docs/triage: no final winner without the planned blind semantic rubric. Existing
  inherited defaults remain configurable and unchanged. No claim of a completed #105 catalogue.

## Verification / remaining gates

New focused tests pass (178 across fixture/driver/examples files). Full typecheck passed; full check had two
5-second timeout failures (cli-hints and examples parsing), 2351 passed/1 skipped; examples passed isolated.
CI/review/security still required before merge. Scope/schema and manual-grading limitations are intentional
report disclosures, not permission to market the models as exhaustively benchmarked.
