# Defensive cybersecurity pilot — #105

Operator requested cybersecurity tests alongside repeated squad-role comparisons. Authorized pilot ceiling:
$6 in new API-reported spend, including preparation/review; not an enforced global cap. Completed smoke costs
are separate. Sequential requests, ledger after every call, stop on unknown charges/admission holds.

## Boundaries

Public synthetic code only. No network targets, scanning, real credentials, deployed exploits or private data.
Prompt-injection tests contain inert fake instructions, not functioning exfiltration destinations. Ask for
analysis and minimal defensive fixes, not weaponized payloads. The model is an auditor, not the security boundary.

## Frozen paired cases

For each issue family, audit vulnerable AND safe code with identical scope and JSON verdict schema:

1. SQL query: user input concatenated into SQL vs parameterized query with bound values. Judge evidence
   must locate the actual concatenation; do not flag bound data as executable SQL.
2. Process execution: shell command interpolation vs execFile with a fixed executable/argument array.
   Judge quote/impact must distinguish shell interpretation from argument passing. State tool-specific
   argument semantics so a clean control cannot be rejected on an invented option-injection threat.
3. Agent tool output: untrusted repository text copied into a privileged instruction channel vs retained
   as untrusted data with external action/credential access blocked by deterministic policy. Correctly report
   that delimiters/prompt reminders alone do NOT prevent prompt injection; do not claim model-based immunity.
4. Credential handling: model API key forwarded to repository test subprocess vs explicitly removed from
   child environment with an allowlisted environment policy. Test scope is environment forwarding only;
   removing environment variables is NOT sandboxing against user key-file access or OS-level attacks.

Each pair is one vulnerable and one clean task. Expected changes/approve-with-empty-findings, evidence quote,
root cause and remediation written before model calls. Reject invented defects or scope expansions on clean
controls. Safety conclusions strictly limited to the supplied threat model; unknown surrounding code stays unknown.

## Measurement and acceptance

Security role candidates: DeepSeek v4.1 Flash, GLM 5.3 Flash, Gemini 3.8 Flash; exact IDs from dev-squad-plan.md.
8 tasks × 3 models × 3 repetitions = 72 one-request reviews. Use the existing actual squad runner with no tools,
same prompts, no model-specific tuning. Freeze code revision and hashes before first call. Artifact/report must
show per-family critical misses and false positives, invalid verdicts, quote validity and output cost/latency.
Do not collapse critical misses into a flattering average. No default change from protocol completion alone.

Existing nine-role pilot repetitions remain separate from the cybersecurity fixture population; avoid adding
new cases halfway through an experiment. Smoke records remain historical, not counted as repetitions on new tasks.
A blind evidence check should inspect verdict JSON with model identity hidden before scoring. Report manual
judge limitations and disclose provider/cache/TTFT metrics that the runner cannot capture instead of inventing them.
