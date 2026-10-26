# Example Brief — Evaluate migration to micro-frontends

## Question
Should we split our monolithic React frontend into micro-frontends before the Q2 release?

## Context
- Team of 12 frontend devs, one shared codebase.
- Release cadence: every 2 weeks, high conflict on shared components.
- Q2 adds a new white-label customer requiring heavy theming.

## Criteria
1. Reduce merge conflict and deployment coupling.
2. Keep initial page load under 2.5s (currently 1.8s).
3. Do not blow up cloud spend.
4. Maintain accessibility (WCAG 2.1 AA).

## Risk appetite
Balanced: we can accept a temporary velocity dip if the long-term gain is proven.

## Areas to cover
- Software architecture (boundary design, shared library strategy)
- Security (supply-chain, CSP, iframe isolation)
- Compliance (accessibility audit, SLA documentation)
- Legal (licence compliance for third-party widget libs)
- DevOps (build pipeline, deployment slots, canary)
- AI research (co-pilot impact on multi-repo workflows)
