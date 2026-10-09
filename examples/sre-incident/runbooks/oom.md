# Runbook: OOMKilled / exit 137

**Signature:** container terminated with `OOMKilled`, exit code 137, pod in `CrashLoopBackOff`.

## Investigate

1. Confirm the kill reason in the pod events or logs (`Last State: Terminated, Reason: OOMKilled`).
2. Compare the container memory `limits` in `infra/k8s/<service>-deploy.yaml` with the
   working-set peak in the last 24h (Datadog `kubernetes.memory.working_set`).
3. Check `get_recent_deployments`: a new image that loads more data at startup is the usual cause.

## Remediate

- If the peak working set is within 2x of the limit and the growth came with a deploy:
  raise `requests` to the observed p95 and `limits` to 2x `requests`. One PR, one file.
- If memory grows without bound (leak): revert the suspect deploy instead of raising limits.
- Never raise limits above the node allocatable minus 20%.

## Verify

- Restarts stop within 5 minutes of the rollout.
- Error rate back under the SLO burn threshold for 10 minutes.
