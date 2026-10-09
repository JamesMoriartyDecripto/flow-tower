# Website & Web Design Studio

An agency pipeline from client brief to a launched, monitored site, with a client sign-off closing each phase. The build is split into a **frontend lane** and a **backend lane** that run in parallel and meet on a Vercel preview with its own seeded database. Sample client: Nordlicht Coffee Roasters (fictional), a coffee shop selling in DK, SE and DE.

```bash
node bin/flow-tower.js examples/web-studio
```

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Brief & Kickoff | Tally webhook → Haiku intake → route → Opus studio lead → signed proposal; Linear project. |
| 2 | Research & IA | Competitor audits (Playwright, fan-out 3–6), DataForSEO keyword map, strategy, sitemap + content model + FigJam flows → client sign-off 1 (max 2 rounds). |
| 3 | UX, Visual Design & Copy | Wireframes → sign-off 2; design system (Figma variables, Code Connect) → tokens.json → Tailwind theme; visual templates (fan-out); copy per page × locale into Payload drafts with a voice/claims guard → sign-off 3 (max 3 rounds). |
| 4 | Build: Frontend lane | Next.js App Router. `packages/ui`, typed API client, RSC pages on **Vercel Functions**, client islands in the **visitor's browser**, middleware on the **edge**. Sub-tower `towers/frontend.tower.yaml`. |
| 5 | Build: Backend lane | OpenAPI 3.1 contract (approved by the FE lead), Payload CMS, migrations, **Neon Postgres** (PII, EU, 5-year retention), route handlers for checkout / Stripe webhook / enquiries on **Vercel Functions**, **Stripe** (test mode) and **Resend** as SaaS. Sub-tower `towers/backend.tower.yaml`. |
| 6 | Integration & QA | Where the lanes join: Vercel preview + Neon `preview/<branch>` (migrated, seeded); Semgrep + Gitleaks, API tests with Stripe CLI, Playwright e2e checkout (4242 card), axe WCAG 2.2 AA, Lighthouse CI, visual regression → gate (3 fix rounds, failures routed to the owning lane) → QA auditor agent. |
| 7 | Client Review, Launch & Monitoring | Client reviews the same preview URL (max 3 rounds), out-of-scope → change request, Vercel Rolling Release 25 % canary with studio-lead approval, weekly Haiku monitor on field Core Web Vitals and conversions. |
| 8 | Tools, Models & Guardrails | Figma, Playwright, GitHub and Vercel MCP servers, deploy guard hook, studio memory (CLAUDE.md), Opus / Sonnet / Haiku 5.5. |

**Frontend and backend.** These are two separate layers (lanes 4 and 5), each with its own lead agent and sub-tower. They are coupled only through `api/openapi.yaml` (linked to the frontend's typed client), CMS drafts and tokens. Both send PRs to `qa.preview`, where they join. Runtimes show where each piece runs: `visitor` (browser), `vercel-fn` (serverless), `vercel-edge` (edge), `neon` (cloud DB), `stripe`, `resend` and `figma` (SaaS), and `gha` (CI).

## Operational features exercised

- `approval` on every client checkpoint (`timeout: 5d`, `on_timeout: escalate`), plus the contract review, destructive migrations and the production release (`on_timeout: reject`).
- `limits.max_iterations` for revision rounds (2 for sitemap and wireframes, 3 for design and preview) and for the QA fix loop; `limits.ttl` for browser sessions.
- `evals`: Lighthouse scores vs targets, LCP/CLS/TBT and field INP with `higher_is_better: false`, axe violations target 0, visual diff, Semgrep blocking findings, checkout conversion, rounds used.
- `fanout` (competitors, templates, pages × locales, locales), `budget`, `trigger` (webhook, event, cron), `data` (PII/EU/1825d on Postgres, PCI on Stripe), `credentials` (user for Figma/Vercel OAuth, service for the bot and handlers), `sandbox` allowlists, `version` + `rollout: canary` (Vercel Rolling Releases), edge `protocol` (mcp, webhook, http), and a `recording` resource (Playwright traces).

## Sources

- Figma MCP server (remote server, Code Connect, write to canvas): https://developers.figma.com/docs/figma-mcp-server/
- Figma MCP tools (get_design_context, get_variable_defs, use_figma, generate_diagram, add_code_connect_map…): https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- Playwright MCP (tools, `--headless`, `--isolated`): https://github.com/microsoft/playwright-mcp
- Playwright accessibility testing with `@axe-core/playwright` (via Context7): https://playwright.dev/docs/accessibility-testing
- Lighthouse CI configuration (collect / assert / upload): https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- Core Web Vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1 at p75): https://web.dev/articles/vitals
- WCAG 2.2 new success criteria (2.4.11, 2.5.8, 3.3.7, 3.3.8…): https://www.w3.org/TR/WCAG22/
- Vercel Rolling Releases (stages, manual approval, `vercel rolling-release complete`): https://vercel.com/kb/guide/how-to-gradually-roll-out-new-versions-of-your-backend
- Neon branch per Vercel preview (`preview/<git-branch>`, migrations in the build): https://neon.com/docs/guides/vercel-managed-integration
- Payload CMS (Next.js native, Postgres, auth, access control) and migrations: https://payloadcms.com/docs/getting-started/what-is-payload, https://payloadcms.com/docs/database/migrations
- Stripe test mode (sandbox, 4242 test card, CLI triggers): https://docs.stripe.com/testing
- Vercel MCP (https://mcp.vercel.com, OAuth) and v0 Figma import (context for generation tools), from search results: https://vercel.com/blog/introducing-vercel-mcp-connect-vercel-to-your-ai-tools, https://vercel.com/blog/working-with-figma-and-custom-design-systems-in-v0

The client, people, numbers and `example` URLs are fictional. Evals are illustrative.
