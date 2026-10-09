# Runbook: elevated 5xx

**Signature:** HTTP 5xx ratio above 2% for 5 minutes on a service behind the ingress.

## Investigate

1. Split 5xx by status: 502/504 point to upstream or timeouts, 500 to the service itself.
2. `get_recent_deployments(service, since="2h")`. A deploy before the first alert is the prime suspect.
3. `get_logs(service, "status:>=500", "30m")` and group by exception class.
4. Check dependencies' alerts in the same incident (`get_alerts`).

## Remediate

- Bad deploy: open a PR that reverts the image tag in `infra/k8s/<service>-deploy.yaml`.
- Timeouts to a dependency: raise the client timeout only with a linked dependency incident.
- Never restart pods by hand to "see if it helps".

## Verify

- 5xx ratio under 0.5% for 10 minutes after the rollout completes.
