# Studio conventions (loaded by every Claude Code session in a client repo)

- Monorepo: `apps/web` (Next.js App Router + Payload CMS 3), `packages/ui` (design system), `packages/api-client` (generated), `api/openapi.yaml` (contract).
- Lanes: frontend owns `apps/web/src/app/(site)`, `packages/ui`; backend owns `apps/web/src/payload`, `apps/web/src/app/api`, `api/`, migrations. Cross-lane changes go through the contract.
- Tokens only: colors, spacing and type come from `design/tokens.json` via the Tailwind theme.
- Never commit secrets; never run against production data; Stripe stays in test mode until the launch checklist.
- Every PR gets a Vercel preview with its own seeded Neon branch. Link the preview URL in the PR.
- Definition of done for a template: Lighthouse mobile >= 90, 0 axe violations (WCAG 2.2 AA), visual diff within 1%, copy from the CMS (no lorem ipsum).
- Production deploys only after the client's written sign-off and the studio lead's approval (deploy guard).
- Client comments arrive as one consolidated list per round; out-of-scope requests become change requests.
