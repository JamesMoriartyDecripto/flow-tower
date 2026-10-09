# Invoicing with Fatture in Cloud

Order-to-cash and purchase-to-pay for an Italian company on **Fatture in Cloud** (TeamSystem),
run by Claude agents with deterministic fiscal guards and a named person on every irreversible
step. Sample company: **Brezza Sensori S.r.l.** (fictional), Bologna: IoT sensors, installation
services and a monitoring SaaS. All clients, VAT numbers, IBANs and people are placeholders.

```bash
node bin/flow-tower.js examples/invoicing-fic
```

The `sales-pipeline` preset ends where this one starts: its closed-won deal is the
`intake.won` webhook here.

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Triggers & Intake | HubSpot closed-won webhook, accepted milestones, a monthly cron for recurring contracts, and manual requests by email or Slack (Haiku classifier). Every request gets an **idempotency key** before anything else. |
| 2 | Client & Data Validation | Client lookup in Fatture in Cloud (`list_clients` with a `q` filter), **VIES** REST check, partita IVA / codice fiscale / codice destinatario / PEC / PA code rules, a Haiku data steward that asks sales ops one precise question, then `create_client` / `modify_client`. |
| 3 | Drafting & Fiscal Checks | Sonnet line drafter **fans out per order line** and only proposes a `vat_case`. Code builds the payload, previews totals (`get_new_issued_document_totals`), and runs the fiscal rules (natura, split payment, reverse charge, bollo, ritenuta) and the numbering / **12-day** guard. |
| 4 | Approval & Issue | Auto-issue only for unchanged recurring invoices under 5,000 EUR. Otherwise an Opus approval brief, the finance controller (24h, escalate) and the CFO (≥ 50k, 48h, wait). Idempotent `create_issued_document`. |
| 5 | SDI Send & Monitoring | The **sub-tower** sends and fixes. Here: the `e_invoices.status_update` webhook, an ES256-verified receiver with ce-id dedupe, a 30-minute sweep for stuck statuses, the `ei_status` router and client notices. |
| 6 | Collections & Credit Notes | PSD2 bank feed, deterministic auto-match, a Haiku remittance reader, mark-paid via `modify_issued_document`, an AR clerk for the rest, a D+3/15/30/45 dunning sequence (Sonnet, Italian templates), a credit manager, and **TD04 credit notes** that always pass the controller (CFO above 2,000 EUR; CFO for every write-off). |
| 7 | Passive Cycle | `received_documents.e_invoices.receive` webhook, Haiku extractor **per received invoice**, PO 3-way match, budget owner approval, **manual registration** in the Fatture in Cloud UI (the API cannot register pending documents), weekly payment run and treasury release with SCA. |
| 8 | Reporting & Compliance | Monthly VAT data, quarterly bollo check, accountant export by SFTP, Opus 13-week cash-flow forecast and digest, AdE conservazione, append-only audit trail, a monthly LLM budget. |

**Sub-tower `towers/sdi-loop.tower.yaml`**: `xml_verify` → `send_e_invoice` with
`options.dry_run` → real send → `ei_status` (wait up to 2 h on `attempt`). A `discarded` status
reads `error_reason` (reason, code, date), a Sonnet fixer proposes a minimal patch, master-data
fixes apply directly and fiscal fixes need the controller, then `modify_issued_document` keeps
the **same number and date** and the loop resends. A 5-day clock (`sla: 5d`,
`max_iterations: 3`) pages the commercialista on day 4 or on a third scarto to renumber in a
sezionale (e.g. `12/R`). The log `logs/sdi-notifications.log` shows a 00311 scarto fixed in a day.

## Operational features used

`trigger` (webhook: HubSpot, Fatture in Cloud status and received documents; cron: recurring
billing, stuck-status sweep, bank feed, dunning scan, payment run, month-end; event: milestone;
email: manual requests; queue: sub-tower entry) · `approval` (sales ops 48h escalate,
controller 24h escalate, CFO 48h wait, AR clerk 3d escalate, credit manager 5d wait, budget
owner 5d escalate, treasurer 24h wait, commercialista 24h escalate) · `fanout` (per order line
1–40, per received invoice 1–20) · `limits` (Fatture in Cloud retries with backoff honouring
Retry-After, concurrency 2, `max_iterations: 3` for SDI resubmission, 2h wait on `attempt`) ·
`budget` (per agent, `on_exceed` stop / pause / downgrade; 180 USD monthly cap with downgrade) ·
`data` (pii and confidential, region eu, retention 3650d) · `credentials` (service for the OAuth
app, user for UI registration and payment release) · `sandbox` (allowlist
api-v2.fattureincloud.it) · `evals` · `sla` (12d issue, 5d scarto fix) · edge `protocol`
(http, webhook, mcp) · `status: experimental` on the MCP tool · a `log` resource.

## Files

`config/` OAuth scopes per identity, webhook subscriptions, order → Fatture in Cloud mapping ·
`rules/` client validation, VAT/fiscal rules table, SDI outcomes and error codes ·
`policies/approval-policy.yaml` · `collections/` dunning sequence, Italian templates,
reconciliation rules · `passive/po-matching-rules.yaml` · `reporting/accountant-export-spec.md` ·
`scripts/` (≤ 80 lines each) OAuth + SDK client, idempotent create, send and poll, webhook
receiver, VIES check, fiscal checks, reconciliation · `prompts/` one per agent · `data/` orders,
bank feed · `logs/` SDI notifications · `samples/` September digest.

## Verified vs illustrative

**Verified in primary sources** (see below): Fatture in Cloud OAuth endpoints and token
lifetimes, scope names, rate limits, SDK packages and every method and field used in
`scripts/` and `config/invoice-mapping.json`, webhook event names, verification handshake, JWT
claims and retry rules, `ei_status` values, the dry-run option, the fact that pending received
documents cannot be registered by API; SDI receipts and the 5-day resend rule; the 12-day and
15th-of-month deadlines; bollo threshold, criteria and calendar; natura codes and SDI error
codes; conservazione service; Garante guidance. The 12-day rule (art. 21 c. 4 DPR 633/72) and
the 10-year retention (art. 2220 c.c.) come from search results quoting AdE documents and the
Civil Code, not from pages opened here.

**Assumptions, marked in the files**: that `settings:r` covers the info endpoints; that
`subject` is filterable with `q` (the ledger is the primary idempotency store anyway); the
mapping from `ei_status` to SDI messages; the 20 % ritenuta rate (art. 25 DPR 600/1973, not
re-checked); the split-payment extension to 30/06/2029 (Council decision of July 2026 as reported by
trade press and a MEF communiqué in search results; the decision text was not opened). **Illustrative**: the company, all thresholds, budgets, eval values and targets,
dunning timings, tolerances and every number in the log and digest.

No official MCP server exists for Fatture in Cloud as of October 2026. A community one
(`aringad/fattureincloud-mcp`, MIT, "Unofficial integration") exposes read and write tools
including `send_to_sdi`; the analyst only has its read tool `get_situation`, with a reader-scope
token. Fatture in Cloud has no sandbox: development uses a standard account on a trial licence.

## Sources (opened)

- Authentication methods and OAuth code flow: https://developers.fattureincloud.it/docs/authentication/ , https://developers.fattureincloud.it/docs/authentication/code-flow/vanilla-code/
- Manual tokens (scoped, never expire): https://developers.fattureincloud.it/docs/authentication/manual-authentication/
- Scopes: https://developers.fattureincloud.it/docs/basics/scopes/
- Limits and quotas: https://developers.fattureincloud.it/docs/basics/limits-and-quotas/
- Query filters: https://developers.fattureincloud.it/docs/basics/filter-results/queries/
- Guides (invoice creation, e-invoice management, pending received documents): https://developers.fattureincloud.it/docs/guides/invoice-creation/ , https://developers.fattureincloud.it/docs/guides/e-invoice-management/ , https://developers.fattureincloud.it/docs/guides/pending-documents/
- Webhooks (overview, subscriptions, notifications, types, expiration): https://developers.fattureincloud.it/docs/webhooks/ and subpages `subscriptions/`, `notifications/`, `notification-types/`, `expiration/`
- SDKs: https://developers.fattureincloud.it/docs/sdks/ , https://github.com/fattureincloud/fattureincloud-python-sdk (README and docs/IssuedDocumentsApi.md, IssuedEInvoicesApi.md, IssuedDocument.md, IssuedDocumentEiData.md, Entity.md), https://developers.fattureincloud.it/docs/sdks/typescript-sdk/
- Developer account / no sandbox (search result summary of the FAQ): https://developers.fattureincloud.it/docs/developer-account/
- Community MCP server: https://github.com/aringad/fattureincloud-mcp
- AdE guide "La fattura elettronica e i servizi gratuiti", December 2025: https://www.agenziaentrate.gov.it/portale/documents/d/guest/guida_fattura_elettronica_dicembre_2025
- AdE guide "L'imposta di bollo sulle fatture elettroniche", June 2026: https://www.agenziaentrate.gov.it/portale/documents/d/guest/l-imposta_di_bollo_sulle_fatture_elettronichegiugno2026
- SdI Specifiche tecniche v1.9 (Allegato A): https://www.agenziaentrate.gov.it/portale/documents/d/guest/allegato-a-specifiche-tecniche-vers-1-9
- Guida compilazione FE v1.9: https://www.agenziaentrate.gov.it/portale/documents/20143/451259/Guida_compilazione-FE-Esterometro-V_1.9_2024-03-05.pdf
- Circolare 13/E del 2 luglio 2018 (scarto: resend within 5 days, same number and date): https://www.agenziaentrate.gov.it/portale/documents/20143/297470/Circolare+n+13+del+02+luglio+2018_Circolare_13_02072018.pdf/da0b0db7-64eb-ac7b-c925-4fdbc776279d
- Circolare 14/E del 17 giugno 2019 (scarto = not issued, no bollo): https://www.agenziaentrate.gov.it/portale/documents/20143/1547896/Circolare+n.+14_17062019.pdf/5ca1cc20-cd57-c9d3-8c71-9747c430d6f6
- AdE FAQ on issuing e-invoices (deferred by the 15th): https://www.agenziaentrate.gov.it/portale/schede/comunicazioni/fatture-e-corrispettivi/faq-fe/risposte-alle-domande-piu-frequenti-categoria/emissione-delle-fatture-elettroniche
- AdE bollo summary page: https://www1.agenziaentrate.gov.it/web_app_entrate/bollo_fatture.html
- SDI messages (RC, NS, MC, NE, DT): https://www.fatturapa.gov.it/it/sistemainterscambio/file-fatture-e-messaggi/
- VIES REST API spec: https://ec.europa.eu/assets/taxud/vow-information/swagger_publicVAT.yaml
- Garante privacy, e-invoicing FAQ: https://www.garanteprivacy.it/temi/fisco/faq-fatturazione-elettronica
