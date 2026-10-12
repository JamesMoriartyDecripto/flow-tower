# Security Policy

Flow Tower is a **local** tool: the server binds to `127.0.0.1` and exposes a read-only file API restricted to the root directory of each loaded tower (symlinks are resolved before the check).

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/JamesMoriartyDecripto/flow-tower/security/advisories/new) on this repository instead of opening a public issue.

## Supported versions

| Version        | Security fixes |
| -------------- | -------------- |
| Latest `0.8.x` | Yes            |
| Older versions | No             |

Flow Tower is pre-1.0. Upgrade to the latest release before reporting, and check whether the issue still happens there.

## What to include

- The version, from `flow-tower --version`.
- Steps to reproduce.
- The impact.

Report only what you have verified and reproduced yourself. Unverified AI-generated reports are not accepted.

## Response

Flow Tower has a solo maintainer, so response is best effort: an acknowledgement within 7 days, then a fix or a decision. If you want it, you will be credited in the advisory.

## Scope reminder

Hub mode (team hub) accepts events from the network. Its security model (tokens, viewers, rate limits) is in [docs/hub-reference.md](docs/hub-reference.md).
