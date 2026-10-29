# Dev Squad model selection: completed smoke stage (2026-10-29)

Tracking #105, implementation/report PR #340. **No defaults changed. No final per-role winners established.**
This completes the approved smoke stage, not the separately proposed repeated pilot or the whole #105 catalogue.

## Method and cost

Actual portable tools/squad/run.mjs; eight endpoint probes, then 29 role/model combinations on two synthetic
fixtures each. Each writable run used a fresh repository, immutable acceptance tests and isolated ledger.
Coder changes were independently checked with node --test (key removed); test and doc hashes unchanged.
Reviewer/security used one-request mode with inline code, not the tool loop. Remaining roles had explicit finish.
58 corrected role tests + one fixture-invalid review attempt = 59 calls/runs; all 58 corrected runs completed.
No admission errors occurred in these role runs. Tests are small; model ordering was grouped, not randomized.

Reported charges: endpoint probes $0.002965; role runs $0.035949; corrected gate runs $0.013295;
**benchmark calls $0.052209**, including the $0.000086 invalid review attempt. Fixture/driver preparation
specialists are a separate additional cost recorded in the issue. These are API-reported rounded ledger charges,
not an independently reconciled invoice; no unknown-cost ledger records. Lead-session cost excluded.
The approved $1 stage ceiling was not reached. No larger pilot calls were made.

## Pair totals and latency

Each row is two tasks, one repetition each. Dollar amounts are the SUM of both tasks, latency is mean wall
seconds including runner overhead, not TTFT or a stable speed benchmark. No significance or reliability claim.
"Checks" means limited deterministic gates; most rows still require full blind rubric grading in the pilot.

| Role | Model | Checks | Pair cost USD | Mean seconds |
|---|---|---:|---:|---:|
| triage | Haiku 5.5 | 2/2 | 0.002256 | 14.3 |
| triage | GLM 5.3 Flash | 2/2 | 0.000723 | 9.6 |
| triage | GPT-6 Luna | 2/2 | 0.000733 | 8.7 |
| architect | GLM | 2/2 | 0.000641 | 22.7 |
| architect | Haiku | 2/2 | 0.002667 | 15.1 |
| architect | Luna | 2/2 | 0.001092 | 12.4 |
| architect | Gemini 3.8 Flash | 2/2 | 0.010363 | 31.7 |
| researcher | GLM | 2/2* | 0.000383 | 13.9 |
| researcher | DeepSeek v4.1 Flash | 2/2 | 0.001721 | 19.8 |
| researcher | MiniMax M3.1 Flash | 2/2* | 0.002157 | 15.5 |
| coder | Haiku | 2/2 | 0.001523 | 9.6 |
| coder | Luna | 2/2 | 0.001162 | 11.6 |
| coder | MiMo v2.6 Flash | 2/2 | 0.001441 | 13.0 |
| coder | Qwen3.8 Flash | 2/2 | 0.002249 | 32.1 |
| tester | Haiku | 2/2 | 0.001026 | 5.2 |
| tester | GLM | 2/2 | 0.000281 | 5.9 |
| tester | Luna | 2/2 | 0.000591 | 6.4 |
| verifier | GLM | 2/2 | 0.000243 | 8.4 |
| verifier | Haiku | 2/2 | 0.001209 | 6.3 |
| verifier | Luna | 2/2 | 0.000552 | 6.2 |
| doc-writer | Haiku | 2/2 | 0.001311 | 6.2 |
| doc-writer | GLM | 2/2 | 0.000612 | 6.9 |
| doc-writer | MiMo | 2/2 | 0.000927 | 5.4 |
| reviewer | GLM | 1/2 | 0.000125 | 4.3 |
| reviewer | DeepSeek | 2/2 | 0.001062 | 6.5 |
| reviewer | Gemini | 2/2 | 0.003122 | 10.3 |
| security | DeepSeek | 2/2 | 0.002638 | 14.8 |
| security | GLM | 2/2 | 0.000889 | 14.1 |
| security | Gemini | 2/2 | 0.005459 | 11.6 |

## Evidence that changes the next shortlist

- **Cheap completion is not research quality.** GLM researcher A said native (-0).toFixed(2) returns
  "-0.00" (it returns "0.00"); B claimed no sibling test existed although tests/guard.test.mjs has one.
  MiniMax A claimed the repo contained exactly one tracked file, although the prepared repository includes
  tests, docs and config. These fail factual accuracy regardless of the green completion gate above.
- **GLM review failed the clean negative control:** approved but emitted two out-of-scope low findings,
  explicitly acknowledging that the code meets the brief. Expected approve with zero findings. Cheap tokens
  do not justify noisy reviews. DeepSeek and Gemini accepted the control without findings.
- All four coder candidates passed both independent suites. Luna was cheaper than Haiku for this pair;
  Haiku was faster. Qwen was both slower and more expensive here, without demonstrated quality benefit.
- GLM tester/verifier costs were lowest on these fixtures; reports correctly distinguished failing A and
  passing B. This is a promising candidate, not a production reliability claim from two tests.
- Gemini cost more on the architect and review tasks without demonstrated additional quality in this sample.
  Keep as hard-task quality control rather than defaulting expensive everywhere.

## Fixture and instrumentation lessons

Initial review prompt wrongly asked a no-tools model to call finish. First GLM attempt produced no verdict;
charge retained above, result classified fixture-invalid, not model failure. Corrected all four gate prompts,
reran all 12 gate cases. Initial endpoint probe supplied expected classification, so it checks protocol only.
Coder prompts previously mixed editing and returned-code instructions; corrected BEFORE role runs.

Driver was dirty relative to its recorded checkout HEAD during runs. runnerCommit identifies the underlying
checkout, not the entire executed source; the driver fixes are committed in a08c246. Raw outcomes are preserved
in 2026-10-29-squad-smoke/{roles,gates,endpoint-costs}.jsonl. Earlier coder tests passed but testsPassed was
not separately persisted until a08c246; deterministicPass incorporated the executed test result. No invented
provider, TTFT or completion-token metrics: runner ledger does not record these. Snapshot/raw tool evidence
is retained locally for audit, with no credentials or private source; it is not a universal published dataset.

## Decision

Keep current defaults unchanged. Advance Luna/Haiku for coding, GLM/Luna for cheap triage/test/verification,
DeepSeek/Gemini for review, GLM/DeepSeek/Gemini for security; investigate research accuracy with harder
held-out tasks before selection. No claim of globally best, no five recommendations/category yet.
The separate $6 repeated pilot still requires approval: minimum three repetitions, stronger tasks, blind scoring,
provider/cache recording and frozen code. This smoke stage cannot honestly complete that acceptance criterion.
