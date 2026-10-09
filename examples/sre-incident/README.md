# SRE Incident Responder

A PagerDuty alert starts one **Claude Managed Agents** session per incident. A read-only
investigator finds the failure signature in a sandboxed container; a separate remediator
ships the fix as a pull request and merges it only after the on-call SRE approves in Slack.
The close-out updates the status page, resolves the incident and drafts a postmortem.

The scenario follows the cookbook: `checkout-svc` is OOMKilled (exit 137) after a deploy
and the fix raises the memory request and limit in `infra/k8s/checkout-deploy.yaml`.

```bash
node bin/flow-tower.js examples/sre-incident/sre-incident.tower.yaml
```

## Layers

| Layer | What it shows |
|---|---|
| Alert Intake | PagerDuty V3 webhook, HMAC check, dedupe, `sessions.create`, incident channel |
| Investigation | investigator + `incident-runbooks` skill, `get_logs` / `get_alerts` / `get_recent_deployments`, signature decision |
| Remediation | remediator (sub-tower), `open_pull_request`, CI guard, `request_approval`, Slack approval, escalation, merge, rollout watch |
| Recovery & Postmortem | status page (Haiku), PagerDuty resolve, postmortem writer (Sonnet), 72h review, archive |
| Harness, Tools & Models | event loop, tool permissions, budget, host-side secrets, Redis, Console trace, models |

`towers/remediator.tower.yaml` drills into one remediator session (edit, diff, PR, approval, merge).

## Operational fields used

`trigger` (webhook), `approval` (on-call, Slack, 15m, `on_timeout: escalate`; postmortem review 72h),
`budget` (per agent and $6 per incident), `limits` (timeouts, session `ttl` 24h, concurrency),
`sandbox` (read-only investigator, no-network remediator), `credentials`, `data`, `evals`,
`version` + `rollout` (remediator v2 canary 20%), `sla`, edge `protocol: webhook`, a `recording` resource.

## Deviations from the cookbook

- The cookbook uses **one** agent for investigation and remediation; here they are split so the
  investigator has no write path at all (edit and write disabled, no write tools).
- `get_logs`, `get_alerts` and `get_recent_deployments` come from the Agent SDK SRE cookbook's MCP
  server; here they are Managed Agents custom tools executed by the app.
- The cookbook approves inline and has no timeout; this adds the 15m escalation, status page,
  incident channel, CI guard and postmortem.

## Sources

- https://platform.claude.com/cookbook/managed-agents-sre-incident-responder
- https://platform.claude.com/cookbook/claude-agent-sdk-03-the-site-reliability-agent
- https://platform.claude.com/docs/en/managed-agents/tools (toolset configs, permission policies)
