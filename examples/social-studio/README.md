# Social Media Studio

An agentic social media operation for one brand on eight networks: weekly planning, listening, creation and repurposing, compliance review, publishing through the official APIs, community management and a weekly report that feeds the next plan. Agents draft; people approve; only a worker publishes. Sample brand: **Halden Bikes** (fictional), an Amsterdam e-cargo-bike maker selling in NL, BE and DE.

```bash
node bin/flow-tower.js examples/social-studio
```

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Strategy & Calendar | Monday 07:00 cron, Opus strategist reads last week's report, the idea backlog and the brand memory, writes `calendar/2026-w41.yaml`, social manager signs off in Slack (24h, escalate, max 2 rounds), briefs are split per slot. |
| 2 | Listening & Ideas | Daily 06:30 sweep: Instagram mentions, Bluesky search, X recent search (pay-per-use), YouTube comments; Sonnet trend scout; Haiku sentiment tagger; a spike/crisis decision opens the crisis path; scored ideas go to the backlog. |
| 3 | Creation & Repurposing | Copywriter (fan-out per brief) writes one hero asset; visual director calls Nano Banana 2 (stills), Veo 3.1 Fast (9:16 b-roll, downgrades on budget) and Canva Autofill (carousels); assets land on the verified media domain; repurposer fans out per platform; spec fitter enforces `config/platforms.yaml`. |
| 4 | Review & Compliance | Haiku brand guard, AI-label check (Instagram `is_ai_generated`, TikTok `is_aigc`, YouTube `containsSyntheticMedia`, Meta AI label for realistic video/audio, EU AI Act Art. 50), rights and disclosure, risk tier, legal for high risk (48h, reject), social manager approval (24h, **reject** on timeout), publish-gate hook. |
| 5 | Publishing | BullMQ queue, slot picker, crisis pause, quota guard (live Instagram and Threads counters, own counters elsewhere), **publisher sub-tower** fanned out per platform, TikTok drafts finished by a person on the phone. |
| 6 | Community & Analytics | Meta webhooks (signed) and 10-minute polling, Haiku triage, routing (hide spam, FAQ templates, drafted replies, Zendesk for orders, comms lead for crises), reply policy guard, reply approval (2h, SLA 4h), crisis lead (15m, SLA 1h), daily insights, weekly analyst, boost advisor on the Meta Ads MCP server (campaigns created PAUSED) with marketing-lead approval. The report links back to layer 1. |

**Sub-tower** `towers/publisher.tower.yaml`: dispatch (idempotency, token refresh, router), eight platform adapters each with its documented limits, then status polling, retry decision (3 attempts, backoff) and a dead-letter queue that pings a person.

## Operational features used

- `trigger`: cron with `timezone: Europe/Amsterdam` (planning, listening, insights, weekly report), webhook (Meta comments/mentions/DMs), queue (publish jobs).
- `approval` on plan, post, legal, reply, crisis, boost and the TikTok finish step; `on_timeout` is `reject`, `escalate` or `wait`, never `approve`. Also `rounds: 2` (plan, post), `escalate_to` (plan, reply), `when: "risk tier == high"` (legal), `per: reply`, `via` as a list and the `takeover` action (crisis lead).
- `decision` typed outputs: spike (binary), risk tier and inbox route (choice with candidates).
- `fanout`: briefs per week, platforms per brief, platforms per post.
- `limits`: timeouts, retries with exponential backoff, publisher concurrency; `rate` quotas per platform adapter (Instagram 100/24h, Threads, TikTok, YouTube, Bluesky points) and X reads (2,000/d).
- `budget`: run-wide weekly text-model cap at the top level; per-agent spend; weekly image/video caps (`for: media`, `on_exceed: downgrade` for Veo); X read and post spend with `rate` unit prices; weekly boost cap in EUR (`for: ads`).
- `async: poll` for Veo, Canva jobs, Instagram containers (1 min, up to 5 min) and the status poller; `exactly_once` on publishing (idempotent by approval id).
- `data`: PII in DMs and helpdesk tickets (EU, 90d / 2y), secrets in the token store, Veo files kept 2 days by Google; `disclosure` on generated media (SynthID) and the AI-label check (platform flags, Meta AI label, EU AI Act Art. 50).
- `credentials`: service (publisher, triage), author (Canva), user (Meta Ads OAuth).
- `evals` and `sla` on approval, triage, replies (4h in business hours) and the weekly report. **All eval values and targets are illustrative.**
- Edge `protocol`: http (Gemini, Canva, platform APIs), mcp (Meta Ads), manual (TikTok posts finished in the app), plus webhook triggers.

## Files

`brand/` voice guide and banned claims · `calendar/` sample week · `config/` platform limits, approval policy, triage rules, generation caps · `prompts/` one per agent · `scripts/` quota guard, AI labels, Canva autofill, insights collector · `src/` approval tool, publish-gate hook, Meta webhook receiver, Instagram / TikTok / Bluesky adapters · `logs/` approvals, publisher, community, listening · `reports/` a weekly report.

## Sources (opened)

- Instagram Content Publishing (100 posts/24h, JPEG, carousel 10, container expiry, `is_ai_generated`): https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
- Instagram webhooks (signature, fields, Advanced Access): https://developers.facebook.com/docs/instagram-platform/webhooks
- Instagram private replies (one message, 7 days, 24h window after reply): https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies
- Facebook Pages posts (scheduling 10 min to 30 days, permissions): https://developers.facebook.com/docs/pages-api/posts
- Threads API limits (250 posts, 1,000 replies, 500 chars, carousel 20): https://developers.facebook.com/docs/threads/overview
- LinkedIn Posts API and rate limits: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api, https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits
- X API pricing and developer guidelines: https://docs.x.com/x-api/getting-started/pricing, https://docs.x.com/developer-guidelines
- TikTok Content Sharing Guidelines, Direct Post and inbox upload: https://developers.tiktok.com/doc/content-sharing-guidelines, https://developers.tiktok.com/doc/content-posting-api-reference-direct-post, https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
- YouTube quota and videos.insert: https://developers.google.com/youtube/v3/determine_quota_cost, https://developers.google.com/youtube/v3/docs/videos/insert
- YouTube altered or synthetic content: https://support.google.com/youtube/answer/14328491
- EU Code of Practice on marking and labelling AI-generated content (Art. 50 from 2026-08-02): https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- Gemini API Veo 3.1 and image generation (model ids, 9:16, SynthID): https://ai.google.dev/gemini-api/docs/veo, https://ai.google.dev/gemini-api/docs/image-generation
- Canva Autofill guide: https://www.canva.dev/docs/connect/autofill-guide/
- Buffer MCP and Ayrshare MCP tools (alternatives to direct APIs): https://buffer.com/mcp, https://www.ayrshare.com/docs/additional/mcp-action-tools.md
- Meta Ads MCP (secondary write-up of Meta's 2026-04-29 launch): https://mcp.directory/blog/meta-ads-cli-mcp
- n8n template with AI generation and approval: https://n8n.io/workflows/5773-generate-and-schedule-social-media-posts-with-gpt-4-and-telegram-approval-workflow/
- Sprout Social Q2 2026 Pulse (crisis response on social): https://sproutsocial.com/insights/press/social-media-is-now-the-primary-channel-for-brand-crisis-response-new-research-finds/

From search results only (the pages did not load): Bluesky rate limits (docs.bsky.app/docs/advanced-guides/rate-limits), Meta's AI label help page, X automation rules (help.x.com), YouTube `containsSyntheticMedia` revision history.

## What is illustrative

The brand, people, handles, ids, URLs on `example` domains, every metric in the logs and the report, eval values and targets, spend caps and EUR budgets. Platform limits and API behaviour are the documented ones as of October 2026; they change often, so the quota guard reads live counters where platforms offer them.
