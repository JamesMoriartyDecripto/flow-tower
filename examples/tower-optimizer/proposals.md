# Proposals

How the drafter writes a proposal, and how it is ranked. One proposal per change; a person approves each one.

## One proposal

```markdown
### P1 · quality.reviewer: add a sandbox (AUD11, warning)

Node: quality.reviewer
Finding: "shell or code tool with no sandbox"
Change (tower diff, validated):
    +        sandbox: { network: none, filesystem: read-only }
Effect: risk ↓ (a reviewer that runs tests cannot write outside the checkout or call out)
Effort: S · Evidence: rule AUD11, best-practices S9
```

- **One change** per proposal: a reviewer can accept one and reject the next.
- **Validated**: the diff is applied to a copy and passes `flow-tower validate` before it is shown.
- **Effect** is measured when history exists (cost, latency per node), else it says "estimated".
- **A model change** cites a benchmark run on the project's own cases, never a price alone.

## Ranking

1. Warnings before infos (something can go wrong in production).
2. Then by expected effect over effort: S (a field), M (a node or an edge), L (a pattern change).
3. Pattern changes (rubric line 1) last: they are the most expensive and need the user's view of the system.
