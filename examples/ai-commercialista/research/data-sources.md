# TeamSystem for an AI commercialista: research notes (2026-10-15)

Status labels: **VERIFIED** = read on the cited page or file today. **SECONDARY** = only from a third party. **NOT VERIFIED** = searched, nothing found or page unreachable.
Caveat: the session's web-search budget ran out during this research. The last checks used direct fetches of known URLs and the GitHub API only.

## 1. Products (names as of 2026)

| Product | What it is | Data an AI accountant needs | Status |
|---|---|---|---|
| **TeamSystem Studio AI** (the studio suite for commercialisti and consulenti del lavoro; cloud) | Modules: "Contabilità e Bilanci", "Dichiarazioni Fiscali", "Gestione dello Studio", "Gestione Antiriciclaggio", "Gestione del Personale", TeamSystem Studio HR, Studio digitale | Prima nota, bilancio, tax returns, payroll all live here, but no API is documented publicly | VERIFIED (product page) https://www.teamsystem.com/commercialisti/teamsystem-studio/ |
| AI e Automazione Contabile (module of Studio AI) | Downloads and books e-invoices; "Servizio di predizione dei conti"; "Creazione automatica dei cespiti dalla fattura"; "Automazione del prelievo delle fatture dall'AdE"; imports bilanci from external accounting | Bookkeeping automation only | VERIFIED https://www.teamsystem.com/commercialisti/teamsystem-studio/funzionalita/ai-automazione-contabile-studio/ |
| Dichiarazioni (Studio AI) | The page only says AI works "in ogni contesto: contabilità, bilanci, dichiarazioni e paghe". It does **not** list Redditi/730/IVA/770/IRAP/F24 or Entratel by name | Filing stays inside the product | Partly: https://www.teamsystem.com/studio-cloud-dichiarazioni-dei-redditi . The model list and Entratel are NOT VERIFIED (the functionality page returned 404) |
| **TeamSystem ViaLibera** | Modular software for "adempimenti fiscali e obblighi contabili" for studi; integrates TeamSystem Digital Box, Fatture in Cloud, Contabilità in Cloud, Cassa in Cloud, Euroconference news and deadlines; AI for booking and account prediction | Same as above | VERIFIED https://www.teamsystem.com/commercialisti/teamsystem-vialibera/ |
| **TeamSystem Digital Invoice** (formerly the TS Digital platform; Agyo not found) | Sending and receiving e-invoices through SDI, conservazione | SDI invoices, conservazione | VERIFIED as a product https://www.teamsystem.com/store/pdf/Infoscheda_TS%20Digital%20Invoice.pdf , https://www.teamsystem.com/magazine/fatturazione-e-normativa/integrazione-api/ . No public API docs found. The name "Agyo" is NOT VERIFIED (not on any TeamSystem page read) |
| **Fatture in Cloud** (TeamSystem group) | Cloud invoicing for SMEs and forfettari | Issued and received invoices (with SDI XML), corrispettivi, F24 records, prima nota (cash book), clients and suppliers | VERIFIED as group brand https://www.teamsystem.com/il_gruppo ; API in §2 |
| Contabilità in Cloud, Cassa in Cloud, Dipendenti in Cloud, CRM in Cloud | Group cloud products | Accounting / HR data | Listed on https://www.teamsystem.com/il_gruppo ; APIs NOT VERIFIED |
| **Danea Easyfatt** | Invoicing and warehouse for small businesses; site footer names TeamSystem S.p.A. | Invoices | VERIFIED https://www.danea.it/ ; API NOT VERIFIED |
| **Reviso** | Cloud accounting (UK entity "Reviso Cloud Accounting Limited"; its privacy link points to teamsystem.com) | Ledger accounts, entries, VAT (public REST API) | Group tie is inferred from that privacy link only. API VERIFIED: https://rest.reviso.com/ , https://www.reviso.com/developer/ |
| TeamSystem HR / Studio HR AI, TeamSystem Enterprise (ERP) | Payroll/HR; ERP for larger companies | Payroll (cedolini), ERP ledgers | Names VERIFIED on https://www.teamsystem.com/il_gruppo ; APIs NOT VERIFIED |
| Euroconference | Training, tax news and commentary (TeamSystem group) | Secondary tax sources (commentary) | VERIFIED as group brand https://www.teamsystem.com/il_gruppo |

The names "Lynfa Studio" and "TeamSystem Commercialista" appear on none of the pages read. The current flagship name is "TeamSystem Studio AI".

## 2. APIs and integration

### Fatture in Cloud API v2: public, documented, VERIFIED
- Developer hub: https://developers.fattureincloud.it/ ("API V2 & SDKs").
- OpenAPI spec (public, version 2.1.8, base `https://api-v2.fattureincloud.it`, last pushed 2026-08-21): https://github.com/fattureincloud/openapi-fattureincloud
- Auth: OAuth 2.0 Authorization Code, OAuth 2.0 Device Code, or a manual token. https://developers.fattureincloud.it/docs/authentication/
- OAuth scopes (`RESOURCE:r|a`): `situation`, `entity.clients`, `entity.suppliers`, `products`, `stock`, `issued_documents.{invoices,credit_notes,quotes,proformas,receipts,delivery_notes,orders,work_reports,supplier_orders,self_invoices}`, `received_documents`, `receipts` (Corrispettivi), `calendar` (Scadenziario), `archive`, `taxes` ("Gestione F24"), `emails`, `cashbook` ("Prima nota"), `settings`. A sub-user still needs permissions from the company admin. https://developers.fattureincloud.it/docs/basics/scopes/
- Relevant endpoints in the spec: `/c/{company_id}/issued_documents/{id}/e_invoice/xml`, `.../e_invoice/send` (SDI), `.../e_invoice/error_reason`, `/received_documents` (+ `/pending`), `/receipts/monthly_totals`, `/taxes` (F24 records + attachments), `/cashbook`, `/settings/tax_profile`, `/info/vat_types`, `/subscriptions` (webhooks).
- **Missing from the API:** chart of accounts, double-entry ledger, bilancio di verifica, cespiti, payroll. The `cashbook` resource is a cash-movement prima nota, not a general ledger.
- SDKs: PHP, JS, TS, Java, C#, Ruby, Python, Go (https://github.com/fattureincloud). Roadmap: webhooks, dry-run, App Store and Zapier are done; batch operations are to do. https://developers.fattureincloud.it/roadmap/
- **MCP:** I found no official MCP server. The fattureincloud GitHub org has no MCP repo (checked through the GitHub API today), and the roadmap does not mention one. Third-party options exist: aringad/fattureincloud-mcp (Python, built on the official SDK, manual token) https://glama.ai/mcp/servers/@aringad/fattureincloud-mcp/blob/1e14636fcd5ff0159215fa2d7711299d0bf8dbd2/README.md ; another community server https://glama.ai/mcp/servers/mhjrq7r36f ; Zapier MCP https://zapier.com/mcp/fatture-in-cloud ; AnythingMCP (hosted, OAuth) https://anythingmcp.com/guides/fatture-in-cloud-to-mcp

### TeamSystem core (Studio AI, Digital Invoice, Enterprise, HR): partner-only, NOT VERIFIED
- No public developer documentation was found. `developer.teamsystem.com` does not resolve (DNS ENOTFOUND today). API Tracker lists no docs, reference or base URL for TeamSystem: https://www.apitracker.io/a/teamsystem
- **SECONDARY only:** a third-party connector vendor claims the APIs are "issued per integration partner and per product line (TeamSystem Enterprise, TS Digital, Alyante…)", with OAuth 2.0, no self-service key and no public sandbox: https://anythingmcp.com/de/marketplace/teamsystem . That vendor is helpcode.ai GmbH and has no affiliation with TeamSystem.
- TeamSystem's own article on e-invoicing APIs names no API product, portal or partner programme: https://www.teamsystem.com/magazine/fatturazione-e-normativa/integrazione-api/
- In practice, plan to get studio data out of TeamSystem Studio through the product's own exports or a partner agreement. I did not verify the export formats; ask TeamSystem.

### Reviso API: public, VERIFIED
REST/JSON. Headers `X-AppSecretToken` + `X-AgreementGrantToken`, a demo account, and webhooks. Free developer agreement by email (address on the developer page). https://rest.reviso.com/ , https://www.reviso.com/developer/

## 3. TeamSystem's own AI

- **TeamSystem Studio AI:** "Interfaccia conversazionale", "Guida proattiva", "Ricerca immediata", "Predizione dei conti", automatic booking and reconciliation, "Gestione bilanci e nota integrativa", cedolini, and a "TS AI Agent" button across contabilità, bilanci, dichiarazioni and paghe. These are bookkeeping and workflow automation claims. https://www.teamsystem.com/commercialisti/teamsystem-studio/
- **Euroconference content** gets an AI-powered search engine inside Studio (TeamSystem marketing, as seen in search snippets; I did not open the page). A Euroconference webinar dated 18 June 2026 warns about "allucinazione normativa e fonti non tracciabili" in consumer AI: https://www.euroconference.it/media/userfiles/files/TS/2026/Contabilita_consulenza_valore_TS_EC.pdf (snippet only).
- **Normo.ai** (TeamSystem majority stake, press release 21 Oct 2025): a generative-AI assistant for tax, legal and labour research and drafting. Its sources are normativa (laws updated daily, EU law), giurisprudenza (Cassazione for the last 5 years, merit-level tax case law, CJEU, ECHR), prassi (Agenzia Entrate circulars, risoluzioni, interpelli; INPS, INAIL, Customs, Labour Ministry), Euroconference commentary, accounting principles and tax forms. It claims answers carry "riferimenti normativi, giurisprudenziali e di prassi". Whether those are clickable links to primary sources is NOT VERIFIED, and I found no API. https://www.normo.ai/ , https://economyup.it/innovazione/teamsystem-acquisisce-normo-ai-startup-dellai-generativa-per-professionisti , https://www.teamsystem.com/media/files/1622_CS_TeamSystem_Normo.ai.pdf
- **xtream** (100% acquired, Sep 2025): AI engineering company, an in-house capability rather than a product. https://www.aziendabanca.it/notizie/tecno/teamsystem-acquisizione-xtream , https://www.teamsystem.com/media/files/1620_CS_TeamSystem_Xtream.pdf
- Bottom line: Studio AI is bookkeeping automation. **Normo.ai** is the TeamSystem product for tax research with cited references. I found no AI feature specific to Fatture in Cloud on the pages read.

## 4. Competitors
- **Wolters Kluwer Tax & Accounting Italia:** Genya / Arca. Public API NOT VERIFIED; the site returned 403 (https://www.wolterskluwer.com/it-it/solutions/genya).
- **Sistemi:** PROFIS (Contabile, Fiscale, Bilanci, AZ) and STUDIO, with an "Intelligenza Artificiale" page. No public API mentioned. https://www.sistemi.com/
- **Bluenext:** Espando Studio (from the URL slug) and Bluenext Human (payroll). No public API mentioned; partner programme only. https://www.bluenext.it/

## 5. Recommendation

1. **Data source via API: Fatture in Cloud API v2 (verified, public, OAuth scopes).** Use it for clients who are SMEs or forfettari and invoice with FIC. It gives SDI XML for issued and received invoices, corrispettivi, F24 records, the cash prima nota and the tax profile. Use read-only scopes (`:r`) and build a thin in-house MCP over the official SDK. There is no official MCP; the community ones are fine as references only. Reviso's public API covers clients with double-entry accounting.
2. **Filing stays in the studio software, done by the professional.** TeamSystem Studio AI or ViaLibera holds contabilità, bilancio/nota integrativa, dichiarativi and paghe, but has no public API (partner-only per a secondary source; the portal does not resolve). The agent should prepare drafts and checks, and the commercialista enters and transmits them. Ask TeamSystem for a partner agreement or the export formats.
3. **TeamSystem's AI as an alternative or complement:** Normo.ai covers the tax-research and citation side (normativa/prassi/giurisprudenza with references). Evaluate it as a research tool, or as a benchmark for our own cited-source agent. Studio AI's assistant covers bookkeeping automation, not cited tax research.
4. **Primary sources still needed:** none of these vendors replaces citing the primary sources (Normattiva, Agenzia Entrate prassi). Normo.ai's citation format and any API are unverified.
