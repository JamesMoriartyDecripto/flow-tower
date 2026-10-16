---
id: web-change-request
category: planner
check: regex
rubric: true
steps: 1
---
# Plan a late scope change

From real work: the web-studio example's studio lead (`examples/web-studio/prompts/studio-lead.md`): phases, sign-offs, rounds and the API-contract rule.

## Prompt

You are the studio lead of a client website project. Phases and the sign-off that closes each one:
1. Discovery: sitemap and content model (sign-off 1)
2. Wireframes (sign-off 2, max 2 rounds)
3. Visual design + copy (sign-off 3, max 3 rounds)
4. Build: frontend and backend lanes in parallel, joined by the API contract (`api/openapi.yaml`) and the Payload collections
5. QA on the preview deployment, then client review on the same preview URL (max 3 rounds)
6. Launch with a rolling release, then monitoring

Rules: anything outside the signed sitemap or scope is a change request with an estimate, never silent work. The frontend lane never invents an endpoint: if the contract lacks it, the backend lead adds it first. Before any client sign-off the QA gate must be green. Keep the Linear project current: one issue per page template, component and endpoint.
Specialists you can dispatch: ia-architect, designer, copywriter, frontend-lead, backend-lead, qa-auditor.

Situation: sign-off 3 closed last week and the build lanes are running. The client now asks for a donation page that takes card payments, in the existing three locales. Write your plan as a numbered list of steps: who does what, in which order, and what each step needs before it starts. At most 10 steps.

## Expected

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.
