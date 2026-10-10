# Release Auditor

The pre-release bug sweep that gated Flow Tower v0.1.0 ([report](reports/v0.1.0.md)), modelled as a tower and run on this
repository. Its gates run again before every release ([v0.2.0](reports/v0.2.0.md)).
It is dogfooding: the tower sets `root: ../..`, so every node opens the real file it describes, and the
scripts report to the tower while they run, so you can watch the audit in Flow Tower itself.

```bash
npm run dev                                         # terminal 1: open "Release Auditor", press F
bash examples/release-auditor/scripts/gates.sh      # terminal 2: deterministic gates, live
npm run e2e                                         # Playwright sweep, live in the "E2E Sweep" sub-tower
```

The gates need `uvx` (for semgrep) and `gitleaks` on the `PATH`. The E2E suite uses the installed Google Chrome.

## Layers

| Layer | What it shows |
|---|---|
| Scope | Release candidate pinned to a commit; charters, threat model, severity rubric and false-positive rules written before the search starts |
| Deterministic Gates | `gates.sh`: tsc, vitest, examples validation, semgrep, npm audit, gitleaks over the whole history |
| Dynamic Sweep | Dev server plus the Playwright sweep (sub-tower) and its report |
| Finders | One read-only Claude Code subagent per charter: correctness, security, UX + a11y, performance, docs; dedupe and scope check |
| Verification | Adversarial verifier with the false-positive rules: reproduced or rejected, never "probably" |
| Triage, Fix, Release | Severity ranking, issues for minors, test-first fixes, re-gate, PR, maintainer decision, tag |

`towers/e2e-sweep.tower.yaml` drills into the Playwright suite in `e2e/`: one test per tower (keyboard walk,
node panel, map view, every sub-tower in and out), live events, panels at six screen sizes, axe.

## Design choices, and where they come from

- **Charters before searching.** Each finder gets one area, one goal and an explicit out-of-scope list:
  bug-bash practice, and the main lever against noise reported for multi-agent audits.
- **Finders in parallel, verification separate.** Claude Code Review runs several agents that look for
  bugs in parallel, then verifies them to filter false positives and ranks them by severity. Here the
  verifier is a fresh agent whose prompt is to *refute*, and a finding needs a reproduction to survive.
- **Precedents for false positives.** Anthropic's security-review action accepts custom
  false-positive filtering instructions; `config/false-positives.md` plays that role.
- **Trust boundaries explicit.** Most false positives in agentic audits come from wrong assumptions
  about trust boundaries, so `config/charters.md` writes them down.
- **State, not pixels.** WebGL content is opaque to the DOM: the E2E tests drive the app from the
  keyboard and assert on a dev-only store hook, fail on any console or page error, and run axe on the
  DOM with the canvas excluded.
- **Every fix ships with a test.** A bug bash finds new bugs; regression tests keep them fixed.

Numbers on nodes (fan-out, timeouts, turn budgets) are this sweep's settings, not benchmarks.

## Operational fields used

`trigger` (manual), `budget` (turns per finder), `limits` (timeouts, concurrency, 2 verifier passes),
`fanout` (one E2E test per tower), `sandbox` (read-only finders, localhost allowlists), `credentials`,
`data` (redacted secrets), `approval` (maintainer via PR review) and typed `decision` outputs (severity,
reproduced or not, fail closed).

## Sources

- https://claude.com/blog/code-review (parallel finders, verification, severity ranking)
- https://github.com/anthropics/claude-code-security-review (false-positive filtering instructions)
- https://arxiv.org/abs/2602.07513 (SPECA: trust-boundary mismatches as the main source of false positives)
- https://arxiv.org/abs/2511.16708 (multi-agent verification: diverse finders find more, and add noise)
- https://playwright.dev/docs/accessibility-testing (axe with `@axe-core/playwright`)
- https://playwright.dev/docs/test-webserver (reuse a running dev server)
- https://github.com/gitleaks/gitleaks (history scan, `--redact`)
- https://semgrep.dev/docs/cli-reference (`--metrics off`, `--error`)
- https://qaskills.sh/blog/bug-bash-facilitation-guide (charters, live triage, regression tests)
