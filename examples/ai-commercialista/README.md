# AI Commercialista (Italy)

An AI accountant for Italian companies that cites every source. Each statement in a memo carries
a citation to a stored text, every citation is checked against the text in force for the tax
period, and a professional signs every memo. Filing, the visto di conformità and any
suspicious-transaction matter stay with people. Sample clients are fictional, and all names,
identifiers and figures are placeholders or illustrative.

```bash
node bin/flow-tower.js examples/ai-commercialista
```

Upstream of the invoice data is `examples/invoicing-fic`. This tower reads the issued and received
invoices from Fatture in Cloud, or the monthly accountant export that the invoicing tower produces
(`reporting/accountant-export-spec.md` there). It never writes to the invoicing account.

## Clients

- **Lumen Grid S.r.l.** (Padova): an ordinary company with a 31/12 year end, registered as a
  startup innovativa since 1/6/2023 according to the client's own data. Its status is not yet
  verified. The sample memo also records a 120 kW photovoltaic plant in service since 30/9/2024.
- **Sara Conti**: a freelance graphic designer under the forfettario regime, ATECO 74.10.10 (to
  confirm against the registration), with no employees and no PV plant.

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Intake & Engagement | A client question or the daily deadline sweep enters. The engagement guard checks the signed mandate with the AI clause (art. 13 L. 132/2025), the absence of an AI opt-out and customer due diligence. An open AML flag also stops the run. Any failed check closes the guard: no AI step runs and the professional takes the case. Triage routes to question, optimization review, deadline action or human only. |
| 2 | Company Data | Fatture in Cloud through read-only scopes, plus uploads from the professional (trial balance, fixed assets, payroll, cassetto fiscale) and the Registro Imprese. The company profile is built per profile (srl, startup, startup-innovativa, fotovoltaico, employer, forfettario). A redaction step pseudonymises personal data before any model sees it. |
| 3 | Sources | A source registry with each source's kind and legal weight. A daily sync fills the source library. An article map covers the testi unici from 1/1/2027. Only stored texts can be cited. |
| 4 | Research & Analysis | The researcher answers from retrieved text only ("no source, no claim"). A lever scanner runs once per savings lever that the profiles touch (fan-out from 1 to 40). Code computes every number. A risk labeller marks abuse-of-law risk under art. 10-bis L. 212/2000 and flags DAC6 cases. |
| 5 | Verification | Quote check, in-force check and support check by a second model, then a gate: pass, retry (at most twice, back to the drafter), or refuse. |
| 6 | Review & Delivery | The commercialista reviews, edits and signs the memo, and nothing leaves the studio without a signature. A draft interpello is prepared for red-labelled cases. The professional files it. |
| 7 | Memory & Audit | The client file and an append-only audit log, kept for 10 years. Weekly evals run against illustrative targets. |

**Sources sub-tower `towers/sources.tower.yaml`** runs the daily sync. It fetches changed acts from
Normattiva, the Agenzia delle Entrate "Normativa e prassi" RSS feed and the Gazzetta Ufficiale ELI
links. INPS, INL, GSE and CERDEF are read by hand when they have no feed. Cassetto fiscale is
never fetched by the agent. Each run splits the text by article and comma, tags in_force_from,
in_force_to, the URN or ELI and the retrieval date, drops duplicates by hash and checks links. A
broken link keeps the old record. When an article changes, the open memos that cite it get a
"norm changed" notice. The library is append-only, so every memo can show the text it was based on.

## How citations are checked

1. **Quotes.** `scripts/check_citations.mjs` requires each cited span to appear verbatim in the
   stored source. Only whitespace is normalised, so a changed number fails. An empty quote or a
   source missing from the store also fails.
2. **In force.** `scripts/check_in_force.mjs` requires each cited article to have been in force in
   the tax period. It flags an article repealed before the period, an old text used for a period
   from 2027, and any press source used as authority.
3. **Support.** A different model from the drafter (Opus) checks that each cited span states the
   claim, for the tax period. A claim whose only source is press gets `not_supported`.
4. **Gate.** Pass, retry (at most twice, back to the drafter with the same sources), or refuse.
   A refusal goes out as a no-source answer that suggests an interpello or research by the
   professional. A claim that fails any check is never shown as settled.

Abuse-of-law labels are green, amber or red under art. 10-bis L. 212/2000. Red is not recommended
and suggests an interpello. DAC6 is flagged for cross-border arrangements, with the 30-day clock to
confirm.

## Source weights

The registry (`config/source-registry.yaml`) gives each source a kind and a weight, strongest first:

| Weight | Meaning |
|---|---|
| law | Binding on taxpayers and the administration: statutes, decrees with force of law, codes, EU law. |
| practice | Binds the administration only: circolari, risoluzioni, interpelli. Relying on it protects the taxpayer from penalties (L. 212/2000 art. 10 c. 2). An interpello reply binds only the applicant and the question (art. 11 c. 5). |
| case law | Cassation and EU courts carry strong weight; merit decisions are persuasive only. |
| standard | Technical accounting standards (OIC) that interpret the law. |
| guidance | Official pages and FAQs. Informational, never the cited authority. |
| data | Registers and open-data feeds, used to retrieve facts. |
| press | A lead only. Follow it to the primary text and never cite it as authority. |

The Gazzetta Ufficiale is the only official text. Normattiva is not official, and the GU prevails if
they differ.

## Law version by tax period

The law that applies follows the tax period, not today's date. Periods up to 31/12/2026 cite the
current texts (DPR 917/1986 TUIR, DPR 633/1972 IVA). From 1/1/2027 the testi unici apply: the new
TUIR (D.Lgs. 117/2026), the IVA testo unico (D.Lgs. 10/2026), and others. A period that straddles
the change goes to a human, because its transitional rules are not mapped. The official
correspondence tables were not published as of 15/10/2026, so the article map
(`config/article-map-2027.yaml`) is empty on purpose. The agent says so and never guesses a new
article number.

## Data inputs

- **Fatture in Cloud**: API v2 with read-only scopes only (issued and received invoices with SDI
  XML, corrispettivi, F24 records, cashbook, tax profile, clients and suppliers). It has no
  ledger, trial balance, fixed assets or payroll.
- **Invoicing-fic export**: the accountant export of `examples/invoicing-fic` can stand in for
  the API.
- **TeamSystem**: no public API was found. Data comes in by upload from the studio software.
- **Cassetto fiscale**: web access only, through the delega unica. The professional uploads what a
  memo needs. The agent never logs in.

## Regulatory frame

- **Art. 13 L. 132/2025**: AI in intellectual professions only supports the professional's work,
  with the professional's intellectual work prevailing. The client is told which AI systems are
  used, in clear language (art. 13 c. 2). The CNDCEC guide "L'aiuto intelligente al Commercialista
  #3" (October 2025) gives a model mandate clause.
- **AI Act (Reg. 2024/1689)**: this use is not high-risk, since Annex III lists no tax or
  accounting use. Art. 50 transparency applies from 2/8/2026. The Digital Omnibus (Reg. 2026/1744)
  moves the high-risk dates, which do not affect this use.
- **GDPR**: the studio is the controller, and personal data is pseudonymised before any prompt.
  Art. 22 rules out automated decisions with legal effect.
- **AML (D.Lgs. 231/2007)**: customer due diligence is required before any AI step. Art. 35
  reports to the UIF, and art. 39 forbids tipping off. The AI never decides about a report, and
  the client is never told about one.
- **Art. 10-bis L. 212/2000**: the abuse-of-law test behind the risk labels.

## Italian-language exception

The client-facing files are in Italian, because the client reads them: the memo template
(`templates/memo-template.md`), the sample memo (`samples/memo-lumen-grid-2026-10.md`) and the AI
information notice (`policies/ai-disclosure-it.md`). The notice is a template that the
professional must complete and approve before it goes to a client. Everything else is in English.

## Verified vs illustrative

**From primary sources** (read on the official page or by a live call on 15/10/2026): the text of
art. 13 L. 132/2025 as quoted by the CNDCEC guide; the Normattiva open-data endpoints and the
Agenzia delle Entrate RSS feed; the testi unici and their GU dates; the 2026 lever figures and
dates as they appear in the research notes (labelled H, high confidence, in the notes); and the
Anthropic Citations behaviour.

**Medium or low confidence, marked in the files**: the iperammortamento procedure dates and the CPB
mechanism for adherents; the esodati share of 89.77% and code 7079; the bonus giovani repeal point
in DL 62/2026; the Smart&Start and Resto al Sud rules (no legal article in the sources); the
interpello deadlines and fee after D.Lgs. 219/2023; the DAC6 sanction amounts (not used); the
implementing decrees of L. 132/2025 (final status not verified); and the existence of an optional
TCF regime for smaller firms (not verified).

**Not verified, and left out of the memos**: the Normattiva article lookup (it returned error
1000 on 15/10/2026, so the sync uses the list); SentenzeWeb (unreachable from the test host); the
MEF case-law database (403 to scripts); and a company self-service visura de minimis.

**Illustrative, not measured**: the monthly budget of 400 USD for the whole system, the per-agent
budgets, the evaluation targets (citation accuracy 0.9 and in-force accuracy 0.95, with the
sample values 0.93 and 0.96), the sample eval questions and their expected answers, the sample
memo's figures (revenue, costs, the 200,000 EUR investment and the two hires are invented), and the
Lumen Grid and Sara Conti data. The eval targets stay illustrative until the studio sets its own
acceptance thresholds, and expert answers must be written by the professional before any score
is reported.

## Sources

Primary, from the research notes (`research/primary-sources.md`, `research/practices.md`):

- Normattiva open data and API: https://dati.normattiva.it , https://www.normattiva.it
- Gazzetta Ufficiale, ELI: https://www.gazzettaufficiale.it/eli/id/2025/09/25/25G00143/sg (L. 132/2025)
- Testi unici and the MEF list: https://www.mef.gov.it/approfondimenti/politica_tributaria/Decreti-legislativi-emanati-sulla-base-della-legge-di-delega-fiscale/
- Statuto del contribuente, L. 212/2000 (URN): https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2000-07-27;212
- Agenzia delle Entrate, normativa e prassi RSS: https://www.agenziaentrate.gov.it/portale/c/portal/rss/entrate?idrss=0753fcb1-1a42-4f8c-f40d-02793c6aefb4
- Agenzia delle Entrate, cassetto fiscale: https://www.agenziaentrate.gov.it/portale/servizi/servizitrasversali/altri/cassetto-fiscale
- CNDCEC guide #3: https://commercialisti.it/wp-content/uploads/2025/10/2025_10_24_Laiuto-intelligente-al-commercialista_-3_DEF-2.pdf
- AI Act art. 50 and Annex III: https://artificialintelligenceact.eu/article/50/ , https://artificialintelligenceact.eu/annex/3/
- Anthropic Citations: https://platform.claude.com/docs/en/build-with-claude/citations
- UIF SOS instructions (in force from 1/7/2026): https://www.fiscal-focus.it/antiriciclaggio-nuove-regole-uif-sos-1-luglio-2026,3,180261 (secondary)
- Fatture in Cloud API: https://developers.fattureincloud.it/docs/basics/scopes/ , https://developers.fattureincloud.it/docs/authentication/

Levers, from `research/levers-2026.md`: Incentivi.gov.it (https://www.incentivi.gov.it/it),
RNA open data (https://www.rna.gov.it/open-data), the MIMIT iperammortamento page
(https://www.mimit.gov.it/it/incentivi/piano-transizione-5-0) and the Agenzia concordato page
(https://www.agenziaentrate.gov.it/portale/-/concordato-preventivo-biennale-pronta-la-circolare-guida-dell-agenzia.-per-il-biennio-2026-2027-adesione-entro-il-prossimo-2-novembre).
Most lever links point to secondary sources, and the notes say to check each against the decree.

