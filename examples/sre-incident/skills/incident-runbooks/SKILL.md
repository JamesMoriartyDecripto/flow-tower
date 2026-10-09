---
name: incident-runbooks
description: How to triage production incidents using the team runbooks.
---

# Incident runbooks

1. Identify the failure signature from logs before anything else
   (exit codes, OOMKilled, HTTP status mix, p99 latency vs. baseline).
2. Consult the runbook named after the signature before proposing a fix:
   - `runbooks/oom.md`: OOMKilled, exit 137, CrashLoopBackOff after memory growth
   - `runbooks/5xx.md`: error-rate alerts, upstream failures, bad deploys
3. Correlate with `get_recent_deployments`: a deploy in the 2h before the first alert
   is the prime suspect until disproven.
4. Open any infra fix as a pull request that cites the runbook section it follows.
5. Never patch live resources directly. Git is the only write path to production.
