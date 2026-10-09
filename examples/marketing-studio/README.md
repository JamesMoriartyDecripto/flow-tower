# Marketing Studio

A B2B growth operation run by Claude agents, from voice-of-customer research to the weekly
budget reallocation. Agents do the research, drafting, scoring and analysis. People make the
decisions that spend money or make claims: messaging sign-off, the quarterly budget, legal
review of claims, spend changes above a threshold and the weekly reallocation. Sample company:
**Tallymoor** (fictional), accounts-payable automation for mid-market finance teams in DE, NL and FR.

```bash
npx flow-tower examples/marketing-studio
```

Organic social posting is out of scope. It appears as one handoff node (`content.social`);
see the `social-studio` preset for that side.

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Research & Positioning | Quarterly cron. Haiku VoC miners (fan-out per source batch) read reviews, HubSpot call transcripts, tickets and win/loss notes. Opus writes the ICP, personas and messaging framework. A **claims register** holds every quantified or compliance claim with its evidence. PMM and legal sign off. |
| 2 | Planning & Budget | Opus planner writes the quarterly brief. The allocator splits the budget on Meridian response curves. CMO and Finance approve (72h, otherwise reject). A **monthly spend cap** (`on_exceed: pause`) applies. |
| 3 | Content & SEO | Semrush MCP and the Search Console API feed keyword clusters and briefs. Writers fan out per brief. Programmatic ERP pages are planned. An editor with SME review publishes to the HubSpot CMS. An experimental AI-search citation panel runs alongside. |
| 4 | Paid Acquisition | Creative variants (fan-out pillar × format), a policy and AI-disclosure guard, and legal review for claims. Audiences are consented and hashed. Campaigns launch **paused** on Google Ads, Meta, LinkedIn and TikTok (TikTok is an experimental test). The paid lead opens the **sub-tower**. |
| 5 | Lifecycle & Email | Product events feed segments and journeys in Customer.io (EU). Consent, opt-out and deliverability guards run before the lifecycle owner approves. The agent cannot send to live audiences. |
| 6 | Conversion & Sales Handoff | Landing pages run a GrowthBook A/B test (50/50). Form leads arrive by webhook and are enriched and scored. The MQL decision writes to HubSpot through MCP, and the SDR has a 1h SLA. Offline conversions go back to Google (enhanced conversions for leads) and Meta (Conversions API). |
| 7 | Measurement & Optimization | Consent Mode v2 defaults, server-side GTM, the GA4 Data API and a BigQuery mart. Attribution, the Meridian MMM and lift tests (GeoX and Meta conversion lift) are never summed. A weekly Opus digest goes to the Head of Growth, then feeds back to the allocator. |
| 8 | Models & Guardrails | Service accounts in Secret Manager, an LLM budget (`on_exceed: downgrade`), an append-only change and approval log, and Opus, Sonnet and Haiku 5.5. |

**Sub-tower `towers/paid-media.tower.yaml`** runs the daily loop. A 06:00 cron or an
intraday spend-spike event starts it. It pulls insights per platform into the spend ledger,
then runs the pacing check (`scripts/pacing_check.py`) and an anomaly scan. If a campaign is
off plan, the Sonnet optimizer proposes a change set; it has no mutate tool. The
deterministic **spend guard** (`scripts/spend_guard.py`) checks the change set next. Changes
under 500 EUR/day and 20 % are applied automatically. Larger ones go to the Head of Growth
(4h, otherwise reject), and cross-channel moves over 5,000 EUR/month go to CMO + Finance (48h).
The loop then applies the changes through each API, reads them back and logs them. The log
`logs/paid-optimizer.log` shows one auto-applied run and one change that the approver edited.

## Operational features used

`trigger` (cron for the quarterly kickoff, the daily loop, the weekly digest, the monthly MMM
and hourly offline uploads; webhook for form leads; event for product events and spend
spikes) · `approval` (PMM/legal 5d escalate, Finance 72h/48h reject, claims 72h reject,
Head of Growth 4h/48h reject, editor 3d wait, SDR 1h escalate) · `fanout` (VoC sources,
briefs, creative variants, platforms) · `limits` (timeouts, retries with exponential backoff,
concurrency for API quotas, `max_iterations: 3` on the optimizer) · `budget` (the 120 k EUR
monthly media cap with `on_exceed: pause`, per-agent LLM budgets, 900 USD monthly LLM
budget with `downgrade`, Semrush unit cap) · `data` (PII/EU on leads, transcripts, audiences
and journeys; confidential mart; secrets) · `credentials` (service accounts; `user` for
LinkedIn's member OAuth; `author` for the strategist) · `evals` (CAC, pipeline ROAS, CTR,
conversion rate, spam rate, inbox placement, trial-to-paid, lead response, pacing error) ·
`sla` (1h lead response) · `version` + `rollout: ab 50 %` (demo-form experiment) · `status`
(planned, experimental) · edge `protocol` (mcp, http, webhook) · a `log` resource.

## Files

`strategy/` ICP and personas, messaging framework, claims register · `plans/` campaign brief, budget
plan · `policies/spend-approval-policy.yaml` · `seo/` keyword clusters, SEO brief ·
`ads/` creative variants, ad policy checklist · `lifecycle/` journey, deliverability rules ·
`cro/` A/B test plan · `sales/` lead scoring rules · `measurement/` measurement plan,
Consent Mode defaults · `scripts/` pacing check, spend guard, GA4 pull · `config/` service
accounts (names only), MCP servers · `prompts/` one per agent · `samples/` weekly digest ·
`data/` VoC sample · `logs/` optimizer log.

## Illustrative vs. sourced

The company, people, budgets, keyword volumes, eval values and targets, test results and
`example` URLs are **fictional and illustrative**. The platform facts come from the sources
below: API versions, MCP endpoints and scopes, quotas, the Google 2x daily / 30.4x monthly
spend rule, Gmail sender thresholds, CAN-SPAM rules, Consent Mode types, the Art. 50 timing,
and Meridian/GeoX capabilities.

## Sources (opened)

- Google Ads MCP (read tools: search, list_accessible_customers, get_resource_metadata): https://github.com/googleads/google-ads-mcp
- Google Ads API quotas (Explorer 2,880 / Basic 15,000 ops per day, 10,000 ops per mutate): https://developers.google.com/google-ads/api/docs/best-practices/quotas
- Google Ads versions (v23 to v25 listed): https://developers.google.com/google-ads/api/docs/sunset-dates
- Google Ads overdelivery (2x daily, 30.4x monthly): https://support.google.com/google-ads/answer/1704443
- Meta Marketing API versions (v25.0 latest, Feb 18 2026): https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/versions
- Meta Ads MCP server (mcp.facebook.com/ads, scopes): https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview, https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started
- Meta Conversions API deduplication (event_id, 48h): https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events
- LinkedIn Marketing API versioning (202609 latest; 202510 sunsets 2026-10-15): https://learn.microsoft.com/linkedin/marketing/versioning
- TikTok Business API SDK: https://github.com/tiktok/tiktok-business-api-sdk
- GA4 MCP server (experimental, run_report, read-only scope): https://github.com/googleanalytics/google-analytics-mcp
- GA4 Data API quotas: https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- HubSpot remote MCP GA (April 13 2026, read/write objects): https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available
- Klaviyo MCP tools (alternative ESP; send_campaign is a write tool): https://developers.klaviyo.com/en/docs/klaviyo_mcp_server_available_tools
- Customer.io MCP (EU endpoint, read / write / write:live scopes): https://docs.customer.io/ai/mcp/get-started/
- Braze MCP (remote, no user-level PII): https://braze.com/docs/developer_guide/mcp_server/
- Semrush MCP (endpoint, API units): https://developer.semrush.com/api/basics/semrush-mcp/
- GrowthBook MCP (remote, api_read / api_write): https://docs.growthbook.io/integrations/mcp
- Anthropic marketing plugin (commands, connectors): https://github.com/anthropics/knowledge-work-plugins/tree/main/marketing
- Google: AI features and your website (no special optimization): https://developers.google.com/search/docs/appearance/ai-features
- Consent mode overview (four consent types, basic vs advanced): https://developers.google.com/tag-platform/security/concepts/consent-mode
- Server-side tagging intro: https://developers.google.com/tag-platform/tag-manager/server-side/intro
- Meridian GeoX (geo experiments, MMM calibration): https://developers.google.com/meridian/geox
- Gmail sender guidelines (0.1 % / 0.3 %, one-click unsubscribe, DMARC): https://support.google.com/a/answer/81126
- FTC CAN-SPAM guide (10 business days, up to $53,088 per email): https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- EU AI Act Art. 50 in effect from 2 Aug 2026: https://www.ictrecht.nl/en/blog/heads-up-ai-act-transparency-obligations-now-in-effect
