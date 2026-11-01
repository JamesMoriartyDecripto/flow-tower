# 320-22: a kept security finding blocks unless it is clearly low or medium

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: one condition. Verify: run test on tests/squad-runner-fix-scope.test.ts and tests/squad-runner-core.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.

Why (review and security): tools/squad/runner-core.mjs reads exactly
        const blocking = kept.some((f) => f.role === 'security' && /^(critical|high)$/i.test(String(f.severity ?? '')));
Severity is model text, so "High.", "high severity" or a missing severity do not block: fail-open.

1. Invert it: a kept security finding blocks unless its trimmed severity is exactly `medium` or `low` (case-insensitive): `f.role === 'security' && !/^(medium|low)$/i.test(String(f.severity ?? '').trim())`. Update the comment above to say it fails closed.
Append tests to tests/squad-runner-fix-scope.test.ts: kept security findings with severity `High.`, missing, and `critical (CVSS 9)` each stop with the "findings still open" message; severity `low` reaches 'pr' with the finding listed as open.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
