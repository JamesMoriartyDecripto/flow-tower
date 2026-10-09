# Legacy Portal Browser Worker

An insurance operations bot for a **legacy insurer web portal that has no API**. Endorsements
(change of address, add a named driver) and claim-document uploads arrive on SQS from
Guidewire PolicyCenter. A Claude **computer-use** agent drives an isolated
**Amazon Bedrock AgentCore Browser** session: search the policy, fill the form, upload the
documents. Every session is recorded to S3, an operator can take over in **Live View**, and a
guard holds *Submit* until a second model has verified every field on a fresh screenshot.

It is meant to be read, not run: the portal and the AWS account are fictional.

```bash
node bin/flow-tower.js examples/browser-worker/browser-worker.tower.yaml
```

## Layers

| Layer | What happens |
|---|---|
| Intake & Triage | SQS → Lambda, DynamoDB idempotency key, Haiku classifier, unsupported items to a review queue, DLQ after 3 receives |
| Browser Session | `StartBrowserSession` (15 min TTL, 8 h for nightly batches), Playwright login over CDP with Secrets Manager, OTP takeover in Live View (`UpdateBrowserStream` disables automation), S3 recordings |
| Computer-Use Worker | Sonnet 5.5 with `computer_20251124`, each action mapped to one `InvokeBrowser` call plus a screenshot; outcome decision and SQS retries |
| Verification & Review | Opus 5.5 verifier in a fresh context, submit guard, Playwright clicks Submit by selector, human exception review, write-back to PolicyCenter |
| Tools & Models | computer tool, InvokeBrowser, Playwright CDP, Secrets Manager, Haiku / Sonnet / Opus 5.5 on Bedrock |

## Operational fields exercised

`trigger` (queue, cron) · `limits.ttl` (15m and 8h), `timeout`, `retries`, `backoff`,
`max_iterations`, `concurrency` with a `description` (the portal's login lock) · `fanout`
(1–6 parallel sessions) · `budget` · `data.sensitivity: pii` / `secret` with region and
retention · `credentials: service` · `sandbox` (host allowlist) · `approval` + `sla` on the
operator takeover (`actions: [takeover, reject]`, two channels in `via`) and the exception
review · `exactly_once` on the guarded submit · typed `decision` on routing, session mode and
worker outcome · `evals` (`illustrative: true`: the portal is fictional, so no number is a
measurement) · `version` + canary `rollout` · resources of kind `recording`, `dashboard`,
`queue`, `database` · edge `protocol: queue`.

## Files

```
prompts/   classifier, computer-use worker, pre-submit verifier
config/    custom browser (recording, TTLs, allowlist) and the per-request field map
src/       intake Lambda, AgentCore Runtime handler, session, login, computer loop, verify, submit guard
samples/   one work item as it arrives on SQS
logs/      worker runs and operator takeovers
```

## Design notes

- **The model never sees credentials.** Login is deterministic Playwright on the automation
  stream; the password comes from Secrets Manager. Anthropic's computer use guidance says not
  to give the model login credentials.
- **The model never submits.** It calls `ready_to_submit`; the guard compares a fresh-context
  verdict with the field map and clicks by DOM selector. Wrong endorsements cannot be undone
  in the portal.
- **Why the older computer tool:** on the Claude API the 5.5 models only accept
  `computer_toolset_20260801`, but on Amazon Bedrock Opus 5.5 and Sonnet 5.5 still accept
  `computer_20251124` with the `computer-use-2025-11-24` beta, which is what this AWS-only
  deployment uses.

## Sources

- Amazon Bedrock AgentCore Browser: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-tool.html
- Sessions, timeouts (900 s default, 8 h max), Live View, recording to S3: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-resource-session-management.html
- `StartBrowserSession`, `UpdateBrowserStream`, Playwright over CDP: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-managing-sessions.html
- `InvokeBrowser` OS-level actions: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-invoke.html
- Claude computer use tool (versions, actions, security guidance): https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
