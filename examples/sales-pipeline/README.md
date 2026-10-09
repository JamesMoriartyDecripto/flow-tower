# Sales Pipeline: prospect to invoice

A B2B sales cycle assisted by Claude agents, from the ideal customer profile to a paid invoice.
Agents research and score accounts, draft outreach, triage replies, prepare calls, score
MEDDICC, draft scopes, prepare negotiation options and chase payments. People make every
decision that binds the company or affects a person's rights: the ICP and data sources, the
first batch of every sequence, discounts and terms above policy, contract deviations, the
invoice sent to SDI and formal payment notices. Sample company: **Ferrovento S.r.l.**
(fictional), a Bologna data and automation consultancy selling fixed-price projects and
retainers to manufacturing SMEs in Northern Italy and France.

```bash
node bin/flow-tower.js examples/sales-pipeline
```

Marketing and demand generation are covered by the `marketing-studio` preset. The full invoicing
workflow (credit notes, SDI rejections, reconciliation) is in the `invoicing-fic` preset. Here
it is one handoff node (`invoicing.invoicing_fic`).

## The design choice that matters: channels follow the country

In **Italy**, art. 130 of the Codice privacy requires **prior consent for promotional email**.
This also covers legal persons as "contraenti". Contact data found in public registers, lists or
websites does not change this. The Garante holds that recital 47 GDPR (direct marketing as a
legitimate interest) cannot replace art. 130. So cold Italian prospects get **rep-led calls to
numbers checked against the Registro pubblico delle opposizioni**, plus **manual** LinkedIn
touches. Email starts only after consent, or for existing customers about similar services
(art. 130(4)). In **France**, B2B email to a work address is allowed with opt-out if it relates to
the recipient's role, so FR prospects get an email-led sequence. `scripts/lawful_basis.py`
decides this deterministically per contact. The agents never decide who may be contacted.

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Targeting | Quarterly cron. The Opus ICP strategist rebuilds the ICP from won and lost deals. A **source register** lists the allowed sources per country and bans INI-PEC extraction, purchased lists and scraped emails. Head of Sales and the DPO approve (5d, escalate). |
| 2 | Prospecting & Enrichment | Weekly cron. Pulls run in parallel (fan-out per source): Atoka API for IT, Apollo MCP for FR, plus consented event lists. Then **dedupe + suppression** run before any credit is spent, followed by the **lawful-basis check**. Apollo enrichment has a credit budget (`on_exceed: pause`). The Haiku scorer fans out per prospect and cites evidence. Tier A/B/C decision. |
| 3 | Outreach | The **sequence engine** (sub-tower, A/B 50 %) runs here. A **first batch review** (24h, wait) and a deliverability guard follow, then Instantly sends. Rep tasks cover calls and manual LinkedIn. A reply webhook feeds Haiku triage into interested / objection / unsubscribe / out of office. Opt-out runs within a 24h SLA. Reps send the objection drafts. |
| 4 | Qualification & Meetings | Inbound form webhook (2h SLA) and Calendly `invitee.created`. Call-prep brief, then the discovery call. Fireflies records **only with consent**. The Sonnet MEDDICC scorer quotes verbatim. The qualified gate writes to HubSpot via MCP. |
| 5 | Proposal & Negotiation | The Opus scoper estimates days only. A deterministic quote builder prices from the rate card. The **discount gate** sends 10-20 % or 60-day terms to the Sales Director (24h, reject) and > 20 % or a margin-floor breach to the CEO (48h, reject). The quote is created via the HubSpot Quotes API, because MCP is read-only for quotes. The negotiation assistant proposes give/get options and never grants them. |
| 6 | Contract & Close | The MSA + SOW + DPA are assembled from templates. A **deviation check** sends redlines to legal (72h). Yousign runs an advanced e-signature. The `signature_request.done` webhook sets the deal to closed-won and triggers the delivery handoff (48h SLA). |
| 7 | Invoicing & Payment | The billing plan is 30/40/30: a proforma for the deposit, then milestone invoices. Deals are mapped to the FIC `issued_documents` payload. **Finance review** comes before sending, because a sent invoice can only be corrected by a credit note. Then come FIC create, `xml_verify` and `send` (12d SLA), and the SDI status webhook. Daily payment matching and a Haiku follow-up agent handle collections; the AR manager decides on formal notices. |
| 8 | Analytics & Learning | A BigQuery pipeline mart and a CRM data-quality guard feed the weekly Opus digest. The monthly win/loss review feeds back into the ICP and the sequences. An LLM budget guard (`downgrade`) and an append-only audit log cover all agents. |

**Sub-tower `towers/outreach.tower.yaml`** (4 layers, 21 nodes):
- **Plan:** a channel plan from the lawful-basis result, approved templates, and A/B variant per account.
- **Draft & Verify:** the Sonnet personalizer writes only two slots per step, fanned out per prospect. An **evidence check** (`scripts/verify_personalization.py`) rejects any claim or number without a cited, fresh source. That is the guard against hallucinated personalization. A compliance check and the first-batch review follow.
- **Send & Pace:** a pacer and a **send guard** (`scripts/send_guard.py`) cap 30 new emails per mailbox per day and 180 per domain, with warm-up ramps and auto-pause on complaints, bounces or blocklists. Then come Instantly, the RPO check and rep tasks.
- **Replies:** the webhook feeds triage, then a route to suppress (24h), reschedule out-of-office, or interested (4h).

## Operational features used

- `trigger`:
  - cron: quarterly ICP, weekly prospecting, daily payments, weekly digest, monthly win/loss
  - webhook: Instantly replies, HubSpot form, Calendly, Fireflies, Yousign, HubSpot closed-won, FIC SDI status
  - queue: sub-tower intake
- `approval`: ICP 5d escalate; first batch 24h wait; rep tasks 2d; Sales Director 24h reject; CEO 48h reject; legal 72h wait; finance 24h escalate; AR manager 72h wait.
- `fanout`: per source, account batch, prospect, prospect in batch.
- `limits`: retries with backoff (FIC honours `Retry-After`), concurrency for API quotas, `max_iterations` on the pacer.
- `budget`: Apollo credits 400 USD/month pause; per-agent LLM budgets; 600 USD/month LLM cap with downgrade.
- `data`: PII/EU with retention for prospects (180d), replies and leads (730d), transcripts (90d); confidential invoices (10 years), mart and audit.
- `credentials`: `service` for integrations, `user` for rep LinkedIn and calls, `author` for scoping and negotiation.
- `evals`: reply rate, positive reply rate, blocked personalization, spam rate, bounce rate, triage accuracy, meeting-held rate, proposal-to-win, meetings per 100 prospects, win rate, sales cycle days, pipeline velocity, DSO.
- `sla`: inbound 2h, interested 4h, opt-out 24h, delivery handoff 48h, invoice to SDI 12d.
- `version` + `rollout: ab 50 %` on the email variant.
- `status: planned` on the invoicing-fic handoff.
- Edge `protocol`: mcp, http, webhook.
- A `log` resource.

## Files

- `strategy/`: ICP and data-source register.
- `compliance/`: channel rules per country and the legitimate-interest assessment.
- `scoring/`: prospect scoring.
- `outreach/`: FR email-led and IT call-led sequences (with opt-out footers), reply triage rules, deliverability limits.
- `qualification/`: MEDDICC scorecard.
- `pricing/`: rate card and discount policy.
- `proposal/`: quote template.
- `contract/`: contract pack outline and Yousign config.
- `billing/`: FIC mapping and dunning policy.
- `scripts/`: lawful basis, dedupe, send guard, evidence check, discount gate, FIC invoice. All ≤ 80 lines, Python 3.9+.
- `prompts/`: one per agent.
- `samples/`: weekly digest.
- `logs/`: one outreach run.

## Illustrative vs. sourced

**Fictional and illustrative:**
- The company, people, prices, rate card, thresholds, deal values and eval values and targets.
- Our own sending caps (30/day/mailbox, 180/day/domain) and the warm-up ramp.
- The 30/40/30 schedule, the retention periods and all `example` domains.

**Taken from the sources below:**
- The Italian and French channel rules and the RPO.
- The Gmail, Yahoo and Outlook sender rules and CAN-SPAM.
- LinkedIn's automation ban.
- MCP endpoints and capabilities: HubSpot (quotes read-only), Apollo (credits, no training), DocuSign as an alternative.
- Webhook event names: Instantly, Calendly, Yousign, Fireflies, FIC.
- FIC endpoints, quotas and `dry_run`, and the 12-day SDI issue rule.
- D.Lgs. 231/2002 late-payment terms and the AI Act Art. 50 timing.

Not legal advice: the rules files are written for a DPO to review.

## Sources (opened)

- Garante, Linee guida spam 4 Jul 2013 (consent even for public data, legal persons, soft spam, third-party lists): https://www.garanteprivacy.it/home/docweb/-/docweb-display/print/2542348
- Garante, decision 17 May 2023, doc. web 9899880 (recital 47 not invocable, art. 130 lex specialis): https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9899880
- Garante, decision 1 Feb 2018, doc. web 7810723 (PEC from INI-PEC / registroimprese): https://www.garanteprivacy.it/garante/doc.jsp?ID=7810723
- Garante, telemarketing and RPO: https://garanteprivacy.it/temi/telemarketing
- EDPB Guidelines 1/2024 on legitimate interest (v1.0, consultation closed): https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2024/guidelines-12024-processing-personal-data-based_en
- AI Act Art. 50 in force 2 Aug 2026, Omnibus (EU) 2026/1744: https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force
- LinkedIn prohibited software and extensions (User Agreement 8.2): https://www.linkedin.com/help/linkedin/answer/a1341387
- Gmail sender guidelines: https://support.google.com/a/answer/81126
- FTC CAN-SPAM guide (B2B included, 10 business days): https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Apollo MCP: https://docs.apollo.io/docs/apollo-mcp
- Instantly create webhook (event types): https://developer.instantly.ai/api-reference/webhook/create-webhook
- HubSpot remote MCP GA: https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available
- Calendly webhook subscriptions: https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions
- Fireflies webhooks: https://docs.fireflies.ai/graphql-api/webhooks
- Docusign MCP connector (alternative to Yousign): https://www.docusign.com/blog/claude-docusign-mcp-connector-guide
- Atoka API: https://atoka.io/pages/en/atoka-api/
- Fatture in Cloud: invoice creation https://developers.fattureincloud.it/docs/guides/invoice-creation/, e-invoice management https://developers.fattureincloud.it/docs/guides/e-invoice-management/, limits https://developers.fattureincloud.it/docs/basics/limits-and-quotas/
- Assolombarda, 12-day rule for immediate e-invoices: https://www.assolombarda.it/servizi/fisco/informazioni/fattura-elettronica-immediata-inviata-al-sdi-oltre-il-12deg-giorno

Secondary, from search results only (not opened):
- Yahoo's 2-day unsubscribe rule and Outlook.com's May 2025 bulk-sender rules.
- Yousign's rename to Youtrust and its webhook retries.
- CNIL's B2B opt-out rule (CPCE L34-5).
- D.Lgs. 231/2002 details.

Check these against the primary pages before relying on them.
