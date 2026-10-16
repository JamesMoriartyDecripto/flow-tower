# Primary sources for an Italian "commercialista AI": what they are, how to fetch them, how to cite them

Research date: 2026-10-15. Method: web search plus direct fetches. Where I could, I checked endpoints live with curl from this machine.
Confidence labels:
- **[V]** verified today on the official site or by a live call.
- **[S]** confirmed by secondary sources (trade press, professional firms) but not on an official page.
- **[K]** from background knowledge, not re-verified today. Check these before relying on them.

---

## 0. Key findings for the system design

1. **Normattiva now has a real open data portal and API.** It is free, needs no key, and offers AKN, NIR XML, JSON, ELI, HTML, PDF, EPUB and RTF, with multivigenza (point-in-time) queries. Use it as the legislation backbone. **[V]**
2. **Many citations go stale on 1 January 2027.** Eight *testi unici* start to apply on that date and repeal the historic sources:
   - DPR 917/1986 (TUIR)
   - DPR 633/1972 (IVA)
   - DPR 600/1973, DPR 602/1973, D.Lgs. 471/1997, D.Lgs. 472/1997, D.Lgs. 74/2000, D.Lgs. 546/1992, DPR 131/1986, and others

   The system must be date-aware. Cite the old article for tax periods up to 2026 and the new TU article from 2027. Map between them with the official concordance tables, which as of September/October 2026 were still being finalised. **[V/S]** Details in section 7.
3. **Practice documents (circolari, risoluzioni, interpelli) bind only the administration.** They do not bind taxpayers or judges (Cass. SU 23031/2007). Relying on them still protects the taxpayer from penalties and interest (L. 212/2000 art. 10 c. 2). An interpello reply binds the administration only for that case and that applicant (art. 11 c. 5). Store a `legal_weight` field for every source. **[V/S]**
4. **Transizione 5.0 (the tax credit) is closed.** For investments from 2026 the measure is the **iperammortamento** (maggiorazione del costo), not a tax credit. **[V]**

---

## 1. Legislation

### 1.1 Normattiva (consolidated legislation): **the primary retrieval source**
- **URL:** https://www.normattiva.it (consultation) and https://dati.normattiva.it (open data portal).
- **Who runs it:** IPZS for the Comitato di gestione, chaired by the DAGL of the Presidenza del Consiglio.
- **Contents:** state numbered acts in three versions: original, in force at a date ("vigente"), and *multivigente* (full amendment history). Updates usually land within about 3 days of the amending act's publication. Source: https://www.normattiva.it/staticPage/guidaAllUso_LaBancaDati **[S]**
- **Open data portal:** launched 24 February 2026, presented at Forum PA in July 2026. **[V]**
  - https://www.ipzs.it/news/comunicati-stampa/normattiva-al-via-il-portale-open-data
  - https://www.ansa.it/sito/notizie/economia/2026/02/24/normattiva-al-via-il-portale-open-data_98d61402-72d0-4351-a7c9-94df6d08a8eb.html
- **API specification (IPZS, "Specifiche API Open Data", latest revision seen 03/09/2025):** https://dati.normattiva.it/assets/come_fare_per/API_Normattiva_OpenData.pdf **[V]**
  - **Production base:** `https://api.normattiva.it/t/normattiva.api`. Pre-production: `https://pre.api.normattiva.it/t/normattiva.api`.
  - **Lookups:**
    - `GET /bff-opendata/v1/api/v1/tipologiche/estensioni`: export formats.
    - `.../tipologiche/classe-provvedimento` and `.../tipologiche/denominazione-atto`.
    - `.../collections/collection-predefinite`: pre-packaged collections.
    - `.../ricerca/predefinita`.
  - **Search:**
    - `POST .../ricerca/semplice`, with body `{"testoRicerca":..., "orderType":"recente", "paginazione":{...}}`.
    - `POST .../ricerca/avanzata`, with date filters and `vigenza: YYYY-MM-DD`.
    - `POST .../ricerca/aggiornati`: acts changed between two dates. Use it for incremental sync.
  - **Detail:**
    - `POST .../atto/dettaglio-atto-urn`, body `{"urn":"urn:nir:...~artN!vig=YYYY-MM-DD"}`.
    - `.../bff-mobile/v1/api/v1/atto/dettaglio-atto`.
  - **Bulk export (asynchronous):**
    1. `POST .../ricerca-asincrona/nuova-ricerca` with a `formato`. It returns a token by email and in the response body.
    2. `.../ricerca-asincrona/conferma-ricerca`.
    3. `.../ricerca-asincrona/check-status/<token>`. A 303 response means the ZIP is ready to download.
    4. `.../collections/download/collection-preconfezionata` for the pre-packaged collections.
- **Live test today (2026-10-15):**
  - `GET tipologiche/estensioni` returned AKN, XML, PDF, EPUB, RTF, URI (ELI), JSON and HTML with no authentication. **[V]**
  - `POST ricerca/semplice` returned results (latest act: L. 25 settembre 2026 n. 166) with no authentication. **[V]**
  - `POST atto/dettaglio-atto-urn` returned `{"code":"1000","message":"Errore generico..."}` for both the spec's own example and TUIR art. 109. Either the detail endpoint was failing today or it needs headers or parameters I did not reproduce. **Flag: unverified, retest.**
- **Licence:** CC BY 4.0, per a Forum Italia post and the portal announcement. **[S]** The licence page on the portal itself rendered empty (it is a JavaScript SPA). Confirm it there.
- **Legal weight: not official.** Normattiva's legal notice (https://www.normattiva.it/staticPage/legal) says its texts "non hanno carattere di ufficialità"; only the Gazzetta Ufficiale printed text is official and prevails if the two differ. **[S]** Cite Normattiva for the consolidated text, and the GU for the official publication.

### 1.2 Permanent identifiers and precise citation
- **URN:NIR resolver:** `https://www.normattiva.it/uri-res/N2Ls?<urn>`. Syntax, per the API spec §1.3.3 and https://www.normattiva.it/staticPage/utilita: **[V]**
  - `urn:nir:<autorità>:<tipo.atto>:<yyyy-mm-dd>;<numero>[~art<N>][@originale | !vig=<yyyy-mm-dd>]`
  - Annexes: `;<numero>:<allegato>~art<N>`
  - Paragraph level (seen in Normattiva's own hrefs): `~art2-com428`
- **URNs that resolve today:** **[V]**
  - TUIR art. 109 as in force on a date: `urn:nir:stato:decreto.del.presidente.della.repubblica:1986-12-22;917~art109!vig=2026-10-15`
  - New TUIR: `urn:nir:stato:decreto.legislativo:2026-06-19;117`
  - TU versamenti e riscossione: `urn:nir:stato:decreto.legislativo:2025-03-24;33`
  - TU IVA: `urn:nir:stato:decreto.legislativo:2026-01-19;10`
  - TU adempimenti e accertamento: `urn:nir:stato:decreto.legislativo:2026-08-05;141`
  - Statuto del contribuente: `urn:nir:stato:legge:2000-07-27;212~art11`
  - Codice civile: `urn:nir:stato:regio.decreto:1942-03-16;262:2~art2423` resolves to R.D. 262/1942. I could not confirm that the article anchor lands on art. 2423, because the page renders client-side. **[S]**
- **ELI on Normattiva:** `https://www.normattiva.it/eli/id/<yyyy>/<mm>/<dd>/<codice redazionale>/{ORIGINAL|CONSOLIDATED}`, where the date is the **GU publication date**. Example: TUIR `https://www.normattiva.it/eli/id/1986/12/31/086U0917/CONSOLIDATED` returned 200. **[V]**
- **ELI on the Gazzetta Ufficiale:**
  - Act level: `https://www.gazzettaufficiale.it/eli/id/<yyyy>/<mm>/<dd>/<codice redazionale>/sg`. Example: new TUIR `https://www.gazzettaufficiale.it/eli/id/2026/07/03/26G00131/sg` returned 200. **[V]**
  - Issue level: `https://www.gazzettaufficiale.it/eli/gu/<yyyy>/<mm>/<dd>/<n>/so/<n>/sg/pdf`.
  - Italy's ELI register entry: https://eur-lex.europa.eu/eli-register/italy.html **[S]**
- **Recommended citation format.** Store both the human-readable string and the URN plus the version date:
  - Human-readable: "art. 109, comma 5, D.P.R. 22 dicembre 1986, n. 917 (TUIR), testo vigente al 15/10/2026"
  - Stored link: `.../N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1986-12-22;917~art109!vig=2026-10-15`
  - For the official publication, add the GU reference: "G.U. n. 302 del 31/12/1986, S.O. n. 126" **[K]**: verify via ELI.
- **URN:NIR parser:** Normattiva also distributes a URN:NIR parser (.jar) that turns plain-text references into links. See the "utilità" page. **[V]**

### 1.3 Gazzetta Ufficiale
- **URL:** https://www.gazzettaufficiale.it (IPZS).
- **Contents:** the official text of every act. The digital GU has been free since 2013. The ELI scheme is described above. **[V]**
- **Access:** free HTML and PDF. No documented open data API was found; Normattiva is the machine-readable route. **[S]**
- **Legal weight:** the official text.

---

## 2. Agenzia delle Entrate practice documents ("prassi")

### 2.1 Where they are published **[V]**
| Type | Listing URL |
|---|---|
| Circolari | https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/circolari; archive: `.../circolari/archivio-circolari` |
| Risoluzioni | https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/risoluzioni |
| Provvedimenti del Direttore | https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/provvedimenti |
| Risposte a interpello (since 1/9/2018) | https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/risposte-agli-interpelli/interpelli; archive: `.../interpelli/archivio-interpelli` |
| Principi di diritto | https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/risposte-agli-interpelli/principi-di-diritto |
| Consulenza giuridica | https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/risposte-agli-interpelli/risposte-alle-istanze-di-consulenza-giuridica |

- **Document URL pattern (Liferay):** `https://www.agenziaentrate.gov.it/portale/documents/20143/<folderId>/<file name>.pdf/<uuid>?t=<ts>`. **[V]**
  - Examples: `.../documents/20143/10360383/Risposta+n.+185_2026/...` and `.../documents/20143/10360006/Circolare+n.+8+del+6+ottobre+2026+(CBP).pdf/...`
  - These URLs are not predictable: discover them from the listing pages or the RSS feed, never construct them.
- **Numbering:** restarts each year, for example "Risposta n. 185/2026" and "Circolare n. 8/E del 6 ottobre 2026". The latest interpello found was n. 185 of 15/10/2026.
- **No API.** The best machine feed is **RSS** (verified, live, with today's items): **[V]**
  - Normativa e prassi: https://www.agenziaentrate.gov.it/portale/c/portal/rss/entrate?idrss=0753fcb1-1a42-4f8c-f40d-02793c6aefb4
  - News: https://www.agenziaentrate.gov.it/portale/c/portal/rss/entrate?idrss=79b071d0-a537-4a3d-86cc-7a7d5a36f2a9
  - Use RSS for incremental updates and scrape the listing and archive pages for the backlog.
- **Site search:** `https://www.agenziaentrate.gov.it/portale/ricerca?keywords=...` (OpenK9). It is general, not prassi-specific. **[V]**

### 2.2 Legal weight
- **Circolari and risoluzioni:**
  - They express the administration's opinion. They do **not** bind taxpayers, courts, or even the issuing administration's own later position, and they cannot be challenged in court: Cass. SS.UU. 2 November 2007 n. 23031. **[S]**
    - https://miolegale.it/massime/circolare-non-vincolante/
    - https://www.filodiritto.com/cassazione-su-civili-la-circolare-dellagenzia-delle-entrate-non-vincola-il-contribuente
  - In practice they bind the Agency's offices internally.
- **Affidamento (reliance):** L. 212/2000 art. 10 c. 2. No penalties or late-payment interest apply if the taxpayer followed the administration's indications, even if those indications are later changed. **[K]**: confirm the text on Normattiva.
- **Statuto del contribuente as amended by D.Lgs. 219/2023:** **[S]**
  - New art. 10-sexies lists the practice instruments.
  - Arts. 10-septies to 10-nonies cover circolari, consulenza giuridica and consultazione semplificata.
  - Art. 11 (interpello) was rewritten.
- **Interpello (art. 11 c. 5, L. 212/2000):** **[S]**
  - The written reply "vincola ogni organo dell'amministrazione finanziaria", limited to the question asked and the applicant.
  - Silence within the deadline counts as agreement with the taxpayer's proposed solution.
  - Acts that conflict with the reply are *annullabili* (voidable).
  - Text via Brocardi: https://brocardi.it/statuto-contribuente/art11.html
  - Other taxpayers can use published replies only as persuasive interpretation.
- **Provvedimenti del Direttore:** implementing acts with external effect when a law delegates to them, for example approving forms and setting technical specifications. They are higher in weight than circolari. **[K]**

### 2.3 FiscoOggi
- **URL:** https://www.fiscooggi.it (redirects to /portale/home). **[V]**
- **What it is:** the Agency's online magazine, presenting itself as a plain-language reading of the Agency's prassi. **[S]**
  - https://agenziaentrate.gov.it/portale/documents/20143/316489/NSI+CS+221108+FiscoOggi_183_CS_nuovo_FiscoOggi.pdf/eb9e8612-694e-8c05-cea8-d5b048ddd529/-/nsi-cs-221108-fiscooggi
- **Legal weight:** none. Treat it as journalism: useful for discovery, never as the cited authority. Cite the underlying circolare, risposta or norm instead.

### 2.4 "Documentazione economica e finanziaria" (CERDEF, Dipartimento delle Finanze)
- **URL:** https://def.finanze.it/DocTribFrontend/RS2_HomePage.jsp **[V]**
- **Contents:** "la banca dati completa ed integrata di normativa, prassi e giurisprudenza in materia fiscale ed economica":
  - historic prassi (including ministerial circulars before the Agency existed)
  - legislation
  - case law, including Cassazione tax rulings and links to regional massimari
  - Agency interpelli, searchable here since January 2022
- **Access:** free on the web, as a publicity service under the Statuto del contribuente. ISO 9001 certified. No API was found; it is a JSP web app (scrape with care). **[V]**
- **Legal weight:** a secondary repository of primary documents. The document's weight follows its type.

### 2.5 The Agency's AI projects
- **Internal 730 assistant:** a generative-AI virtual assistant for Agency staff answering questions on the 730 return. **[S]**
  - Trained on official 2025 instructions, guides and FAQs, and tested on about 1,000 questions.
  - Used experimentally at the Salerno multichannel assistance section since 1 August 2025.
  - The Director told Parliament it supports operators and does not replace them.
  - https://edotto.com/articolo/fisco-digitale-ia-e-sicurezza-dei-dati-al-centro-della-strategia-dellagenzia
  - https://www.ipsoa.it/documents/quotidiano/2025/10/30/processi-fiscali-intervento-umano-resta-fondamentale
- **Convenzione MEF-Agenzia 2026-2028:** foresees "un impiego crescente dell'intelligenza artificiale". **[S]**
  - https://www.mysolution.it/fisco/informazioni/news/2026/09/032/agenzia-delle-entrate-sempre-piu-digitale-notifiche-telematiche-ia-e-servizi-su-misura/
- **Not found:** no public taxpayer-facing generative chatbot from the Agency as of October 2026.
- **Reported, unverified:** a December 2025 Agency statement reaffirming that generative AI must not directly produce administrative acts.
- **Prodigit (MEF / Consiglio di Presidenza della Giustizia Tributaria / Sogei):** an AI project for tax litigation (massimazione and outcome predictability), funded by the PON Governance programme and the PNRR. I found no 2026 status. **[S]**
  - https://www.agendadigitale.eu/documenti/giustizia-digitale/prodigit-come-funziona-il-progetto-per-la-giustizia-tributaria-digitale/

---

## 3. Case law

### 3.1 Corte di Cassazione: SentenzeWeb (ItalgiureWeb)
- **URL:** https://www.italgiure.giustizia.it/sncass/. Court site: https://www.cortedicassazione.it **[S]**
- **Contents:** civil (including the Sezione tributaria, Sez. 5) and criminal judgments and orders. Free access is described as covering roughly the last 5 years plus the current one; some sources say texts from 2011 onward. Searchable by keywords, cited norms and date. **[S]**
- **Access:** free, no registration for SentenzeWeb. The full ItalgiureWeb (CED) is paid or by subscription. No public API.
- **Could not verify live:** the connection from this machine was refused, and the host has a known certificate-chain problem. The service was also suspended in 2023 to check anonymisation.
- **Legal weight:** not binding precedent in a strict sense (civil-law system). Sezioni Unite rulings carry strong *nomofilachia* weight (art. 374 c.p.c.). Cite as "Cass., sez. V, ord. n. X/AAAA" or "Cass., SS.UU., sent. n. X/AAAA".

### 3.2 Tax courts on the merits (Corti di giustizia tributaria di primo e secondo grado)
- **Database:** "Banca dati della giurisprudenza tributaria di merito", run by MEF, Dipartimento della Giustizia Tributaria.
  - https://bancadatigiurisprudenza.giustiziatributaria.gov.it (403 to curl from this machine, so it is probably bot-protected)
  - The portal https://www.giustiziatributaria.gov.it redirects to https://www.dgt.mef.gov.it/gt/it/web/guest **[V]**
- **Contents:** **[S]**
  - Pseudonymised first- and second-instance decisions: 467,587 decisions from 2021 to September 2024; by July 2025, digital decisions deposited up to 28/02/2025.
  - Massime from the Ufficio del Massimario nazionale (art. 24-bis D.Lgs. 545/1992), with a filter for massimati decisions and links to Cassazione outcomes.
  - Searchable by words, number and year, value, outcome, subject and costs.
- **Access:** free, no API; officially for study and research. **No 2026 update notice was found.**
  - https://tg24.sky.it/economia/2024/06/29/banca-dati-merito
  - https://www.finanzaefisco.com/banca-dati-di-g-t-aggiornamenti/
- **Regional massimari:** PDFs, also via CERDEF.
- **Legal weight:** persuasive only. Merit decisions conflict often, so cite them as trend evidence, never as rules.
- **Related, non-tax:** the Ministry of Justice "Banca dati pubblica" of civil merit decisions, https://bdp.giustizia.it, which needs SPID/CIE/CNS (500 / access-denied to curl). **[S]**

### 3.3 Corte costituzionale
- **URL:** https://www.cortecostituzionale.it/ricerca-pronunce; open data page https://www.cortecostituzionale.it/contenuti/rapporti-cittadini/open-data; service https://dati.cortecostituzionale.it (200). **[V]**
- **Contents:** about 18,000 decisions from 1956, massime, judges, and pending norms. Formats are XML, JSON and CSV, as bulk downloads.
- **Licence:** not stated on the page. A 2013 source said CC BY-SA 3.0. **[S]**: verify.
- **Legal weight:** declarations of unconstitutionality have *erga omnes* effect (art. 136 Cost.). This is binding.

### 3.4 EU (VAT, State aid, customs)
- **EUR-Lex:**
  - VAT Directive 2006/112/EC, ELI http://data.europa.eu/eli/dir/2006/112/oj **[V]**
  - De minimis Regulation (EU) 2023/2831 **[K]**
- **Machine access:** **[V/S]**
  - Cellar SPARQL endpoint https://publications.europa.eu/webapi/rdf/sparql (200)
  - Cellar REST API for documents
  - EUR-Lex SOAP web service: free, registration required, daily call quota. https://eur-lex.europa.eu/content/help/data-reuse/webservice.html
- **CJEU case law:** https://curia.europa.eu/juris/recherche.jsf (now redirects to infocuria.curia.europa.eu). CJEU judgments are also in EUR-Lex/Cellar (CELEX 6xxxxCJxxxx), with ECLI identifiers.
- **Legal weight:** binding interpretation of EU law (art. 267 TFEU). Highly relevant for IVA.

---

## 4. Accounting standards

- **Codice civile, artt. 2423-2435-ter (bilancio):**
  - 2423: clausola generale
  - 2423-bis: principi di redazione
  - 2424 / 2425 / 2425-ter: stato patrimoniale, conto economico, rendiconto finanziario
  - 2426: criteri di valutazione
  - 2427: nota integrativa
  - 2435-bis: bilancio abbreviato
  - 2435-ter: micro-imprese

  Normattiva via R.D. 16 marzo 1942 n. 262 (see 1.2). Binding law. **[K]** (article content); **[V]** (the act resolves).
- **OIC (Organismo Italiano di Contabilità):** https://www.fondazioneoic.eu **[V]**
  - Principles in force: https://www.fondazioneoic.eu/principi-contabili-category/2025/
  - Archive: https://www.fondazioneoic.eu/principi-contabili/
  - Consultations: https://www.fondazioneoic.eu/category/attivita-nazionale/consultazioni-in-corso-4/
  - Recent changes:
    - OIC 34 (ricavi) applies from FY 2024. **[S]**
    - Amendments to OIC 13, 16, 24, 25 and 31 apply from FY 2026, with early adoption allowed. **[S]** https://www.bdo.it/getattachment/3320f77d-2996-4773-b801-776f9d9239c8/OIC-UPDATE-2026-01-NOVITA-OIC-v2.pdf
    - Draft principle for micro and small enterprises in consultation since 7/8/2026. **[V]**
  - Access: free PDF downloads, as I understand it. **[K]**: the home page does not state it.
  - Legal weight: technical standards that interpret and supplement the codice civile (role in D.Lgs. 38/2005 art. 9-bis **[K]**). Not law, but they matter for tax: for non-micro OIC adopters, *derivazione rafforzata* (TUIR art. 83) gives tax relevance to OIC qualification, classification and timing. A MEF decree coordinating OIC 34 with IRES/IRAP was drafted in June 2025; I did not confirm whether it was adopted. **[S]**
- **IFRS (listed companies, banks, insurers, and voluntary adopters):**
  - Reg. (CE) 1606/2002 and D.Lgs. 38/2005. The legally relevant text is the EU-endorsed version in EUR-Lex (consolidated Reg. (UE) 2023/1803 **[K]**).
  - The IFRS Foundation site https://www.ifrs.org/issued-standards/list-of-standards/ (200) needs free registration for full texts. **[K]**
- **XBRL for the Registro Imprese filing:**
  - The 2026 filing campaign (FY 2025 financial statements) still uses **PCI taxonomy 2018-11-04**. PCI 2015-12-14 applies only to statements before D.Lgs. 139/2015. **[S]**
  - The Unioncamere "Manuale operativo deposito bilanci" is published yearly; the 2026 edition is dated April/May 2026.
    - https://www.ipsoa.it/documents/quotidiano/2026/05/08/bilancio-2025-via-campagna-depositi-presso-registro-imprese
    - https://www.unioncamere.gov.it
  - Filing deadline: 30 days from approval (c.c. art. 2435). Signature is CAdES; attachments are PDF/A.
  - The taxonomy is published by XBRL Italia / AgID. **[K]**

---

## 5. Company data sources

### 5.1 Registro Imprese / InfoCamere
- **URLs:** https://www.registroimprese.it (200) and https://webtelemaco.infocamere.it (Telemaco). **[V]**
- **Contents:** visure (ordinary and historical), filed bilanci (XBRL plus PDF), deeds, officers, shareholders.
- **Access:** **[S]**
  - Basic identification is free on registroimprese.it.
  - Visure and bilanci are **paid**: per-document fees (diritti di segreteria) via Telemaco Pay, or through official InfoCamere distributors.
  - InfoCamere offers integration services, but I found no public, self-serve official API with published prices.
  - Commercial resellers (OpenAPI-type aggregators) exist; they are not primary sources.
- **Legal weight:** legal publicity (pubblicità legale, c.c. art. 2188 ff.). A certified visura is evidence.

### 5.2 Cassetto fiscale
- **URL:** https://www.agenziaentrate.gov.it/portale/servizi/servizitrasversali/altri/cassetto-fiscale **[V]**
- **Contents:**
  - registry data and tax domicile
  - filed returns, Certificazioni Uniche, F24 payments, refunds
  - registered deeds, Agency communications
  - VAT and other credits, ISA data, VIES status
- **Third-party access:** **[V/S]**
  - The *cassetto fiscale delegato* is open to intermediaries under art. 3 c. 3 DPR 322/1998 (commercialisti, CAF and similar), under the **delega unica** regime:
    - Legal basis: art. 21 D.Lgs. 1/2024.
    - Provvedimento 2/10/2024 n. 375356, amended 20/5/2025 and 7/8/2025 prot. 321918.
    - Operational since 8/12/2025.
  - One communication covers cassetto fiscale, Fatture e Corrispettivi, ISA/CPB data and AdER services.
  - The delega is valid until 31 December of the 4th year after it is granted.
  - Maximum **two** intermediaries per taxpayer. **[S]**: the official page I read did not state the cap.
  - Old-procedure delegations last at most until **28/02/2027**. **[S]**
  - Intermediaries cannot see the 2/5/8 per mille choices, prima casa decadence notices, or automated partial assessments. **[V]**
- **Access method:** web UI only (SPID/CIE/CNS, or Entratel for intermediaries). **No public API.** An AI agent cannot log in as the intermediary unattended without breaching terms of use.
  - Design implication: the human intermediary exports the data, or the system uses the Agency's bulk-acquisition services where they exist (for example ISA/CPB bulk requests).

### 5.3 Fatture e Corrispettivi, SDI, FatturaPA
- **Portal:** https://ivaservizi.agenziaentrate.gov.it/portale/ (authenticated). Technical documentation: https://www.fatturapa.gov.it (200). **[V]**
- **Format and channels:** FatturaPA XML, specification **v1.9.1**, published 31/03/2026 and in effect from 15/05/2026. **[S]**
  - Changes: control 00327 for VAT groups, updated WS/SFTP accreditation, a new code for exempt sports workers, and the per-platform cap on codici destinatario raised from 100 to 300. The XSD schema is reported unchanged.
  - Sources: https://www.informazionefiscale.it/fattura-elettronica-2026-novita-specifiche-tecniche and https://ntplusfisco.ilsole24ore.com/art/fattura-elettronica-le-nuove-specifiche-fino-300-codici-destinatario-le-aziende-piu-sedi-AIXTZ3QC
  - Routing: delivery by the 7-character *codice destinatario* or by PEC. The SDI channels are PEC, web service (SDICoop) and SFTP (SDIFTP); WS and SFTP need accreditation. B2B transmission format FPR12, B2G FPA12; document types TD01-TD29. **[K]**
- **Access for a third-party system:**
  1. As an accredited SDI channel or intermediary: receive invoices directly by WS/SFTP. This is the cleanest programmatic route.
  2. Through a delegated intermediary in the portal: "consultazione e acquisizione delle fatture elettroniche", with explicit adhesion required (FAQ of 18/4/2019, Ris. 62/E/2019). **[S]**
  3. Through commercial e-invoicing providers' APIs (not primary).
- **Conservazione:** the Agency offers a free electronic archiving service via the portal, based on an agreement; legal retention is 10 years under c.c. art. 2220 and DPR 600/73 art. 22. **[K]**
- **Legal weight:** the XML on SDI is the legally valid invoice. It is primary evidence.

### 5.4 F24 and tax returns ("modelli e istruzioni")
- **Forms index:** https://www.agenziaentrate.gov.it/portale/strumenti/modelli (200). Per-audience return pages:
  - https://www.agenziaentrate.gov.it/portale/imprese/dichiarazioni
  - https://www.agenziaentrate.gov.it/portale/intermediari/dichiarazioni
  - **[V]**
- **F24:** https://www.agenziaentrate.gov.it/portale/schede/pagamenti/f24/compilazione-invio-f24-via-web **[V]**. Codici tributo are created by risoluzione; search them in the risoluzioni listing. **[K]**
- **Annual cycle:** each year a Provvedimento del Direttore approves the forms, instructions and technical specifications for the year: Redditi SC, Redditi SP/ENC, IRAP, IVA, 770, CU. These are approved January to March for the previous tax year. **[K]**
- **Deadlines:** **[K]**: confirm each year on the scadenzario.
  - Redditi, IRAP and 770: by 31 October.
  - IVA annual return: by 30 April.
- **How to use them:** the instructions are prassi-level but very practical. Cite as "Istruzioni Modello Redditi SC 2026, quadro RF, rigo RFxx".

---

## 6. Incentive databases

### 6.1 incentivi.gov.it (MIMIT)
- **URL:** https://www.incentivi.gov.it/it **[V]**
- **Contents:** a catalogue of public incentives (national and regional), each with a registry sheet.
- **Open data:** https://www.incentivi.gov.it/it/open-data **[V]**
  - Full catalogue as compressed CSV and as JSON, plus a data dictionary: https://www.incentivi.gov.it/sites/default/files/2024-01/Metadati_Scheda_Incentivo_1.pdf
  - Licence **IODL 2.0**.
  - **No API** and no stated update frequency. Download the JSON on a schedule.
  - Third-party Apify scrapers exist; they are not official.
- **Legal weight:** informational. The legal basis is each measure's decree or bando.

### 6.2 Registro Nazionale degli Aiuti di Stato (RNA)
- **URL:** https://www.rna.gov.it (200). **[V]**
  - Public transparency search: https://www.rna.gov.it/trasparenza/aiuti, also `/trasparenza/misure`, `/trasparenza/soggetti`, `/trasparenza/deggendorf`.
  - Open data: https://www.rna.gov.it/open-data, licensed **CC BY 4.0** (stated on the page).
- **Legal basis:**
  - L. 234/2012 art. 52 **[V]** (the page cites L. 57/2001, L. 234/2012, DM 22/12/2016 and DI 115/2017).
  - De minimis Reg. (UE) 2023/2831: €300,000 over 3 rolling years, from 1/1/2024. **[K]**
- **Visura de minimis / visura aiuti:**
  - Generated by the **granting authority** in the RNA's restricted area before it grants aid, as a mandatory check. **[S]**
  - Anyone can see a company's registered aid through the public transparency search by tax code (codice fiscale).
  - I did not find an official self-service "visura de minimis" for the company itself. Paid third-party sites resell it. **Flag: unverified.**
- **Practical approach:** compute the de minimis headroom from the RNA open data or transparency search by codice fiscale. Then reconcile with the company's own records, because aid granted to the *impresa unica* (the group) counts too.

### 6.3 MIMIT tax-credit pages and Transizione 5.0
- **Page:** https://www.mimit.gov.it/it/incentivi/piano-transizione-5-0 (last modified 30/6/2026). **[V]**
- **Transizione 5.0, the original tax credit:**
  - Legal basis: art. 38 DL 19/2024, converted by L. 56/2024; DI 24/7/2024; amended by L. 207/2024 commi 427-429.
  - Covered investments from 1/1/2024 to 31/12/2025.
  - **Funds exhausted** (decree of 6/11/2025), so it is **closed**.
- **Since 2026:** the **"Nuovo Piano Transizione 5.0 - Iperammortamento"**. **[V]**
  - It increases the depreciable cost of the assets; it is not a tax credit.
  - Legal basis: L. 199/2025 (legge di bilancio 2026) commi 427-436 **[S]**, DL 38/2026 art. 8, and DL 42/2026.
  - GSE booking platform (NPTR5) open since 12/6/2026.
  - Investments up to 30/9/2028 **[S]**; rates up to 180% **[S]**.
- **Other MIMIT measures** have their own pages under https://www.mimit.gov.it/it/incentivi (timed out from here).
- **GSE:** the Transizione 5.0 page URL I tried returned 404; find it via the GSE Area Clienti.
- **Invitalia:** https://www.invitalia.it (200). Managing body for many measures (Smart&Start, Resto al Sud, contratti di sviluppo). It publishes bandi and FAQs and has no API. **[V/K]**

---

## 7. The testi unici of the 2024-2026 tax reform (L. 111/2023 art. 21)

**Main sources:**
- MEF list: https://www.mef.gov.it/approfondimenti/politica_tributaria/Decreti-legislativi-emanati-sulla-base-della-legge-di-delega-fiscale/ **[V]**
- Camera dei Deputati dossier (21/7/2026): https://temi.camera.it/leg19/temi/la-riforma-fiscale.html and https://www.camera.it/temiap/documentazione/temi/pdf/1423919.pdf **[V]**

| D.Lgs. | Testo unico | GU | Applies from | Main sources it replaces (indicative) |
|---|---|---|---|---|
| 173/2024 (5/11/2024) | Sanzioni tributarie amministrative e penali | Nov 2024 | **1/1/2027** (postponed from 1/1/2026 by DL 200/2025 art. 4 c. 1, converted by L. 26/2026) | D.Lgs. 471/1997, 472/1997, 74/2000 |
| 174/2024 (5/11/2024) | Tributi erariali minori | Nov 2024 | **1/1/2027** (DL 200/2025 art. 4 c. 2) | minor taxes |
| 175/2024 (14/11/2024) | Giustizia tributaria | Nov 2024 | **1/1/2027** (DL 200/2025 art. 4 c. 3) | D.Lgs. 545/1992, 546/1992 |
| 33/2025 (24/3/2025) | Versamenti e riscossione | GU 26/3/2025 | **1/1/2027** (DL 200/2025 art. 4 c. 4) | DPR 602/1973, D.Lgs. 241/1997 (parts), etc. |
| 123/2025 (1/8/2025) | Imposta di registro e altri tributi indiretti | GU 12/8/2025 | **1/1/2027** (DL 200/2025 art. 4 c. 5) | DPR 131/1986, D.Lgs. 346/1990, etc. |
| 10/2026 (19/1/2026) | IVA (171 articles) | GU n. 24, 30/1/2026, S.O. 4 | **1/1/2027** (its own art. 171) | DPR 633/1972, DL 331/1993 |
| 117/2026 (19/6/2026) | Imposte sui redditi (new TUIR, 377 articles, 4 parts, 9 annexes) | GU n. 152, 3/7/2026, S.O. 26; in force 4/7/2026 | **1/1/2027** (art. 377) **[S]** | DPR 917/1986 |
| 141/2026 (5/8/2026) | Adempimenti e accertamento | GU 6/8/2026 | **1/1/2027** (art. 368, per the MEF page) | DPR 600/1973, DPR 322/1998, etc. |

**Notes:**
- **In force vs applicable.** The decrees are *in vigore* from publication, but apply only from 1/1/2027. Until 31/12/2026 the old sources apply. For tax periods straddling the change, transitional rules in each TU govern. **[V/S]**
- **Sanctions.** The substantive sanctions reform (D.Lgs. 87/2024) already applies to violations from 1/9/2024. The TU sanzioni only consolidates it. **[K]**
- **Rule changes since the drafts.** These are compilations ("compilativo"), but they do change substance in places. Example: the new TUIR separates permanent and temporary bonus edilizi and coordinates with DL 38/2026, converted by L. 88/2026, which restored the dividend/PEX regime. **[S]** https://www.finanzaefisco.com/pubblicato-testo-unico-imposte-redditi-dlgs-117-2026/
- **Correspondence tables.** The Agency, Sogei and the Dipartimento Finanze are building tabelle di concordanza software that maps old articles to new ones; it was not yet public in the latest source I found. **[S]** https://www.studiopizzano.it/raccordo-codice-tributario-e-testi-unici-fiscali
- **What comes next.**
  - The delega for testi unici ends 31/12/2026 (extended by L. 120/2025).
  - A **Codice tributario** (general part plus special part) is planned, possibly by 29/8/2028; the government aimed to bring it to the Council of Ministers around October 2026. **[S]**
  - Edotto calls the TU adempimenti e accertamento the "eighth and last" testo unico. I found no announced TU on agevolazioni or local taxes; D.Lgs. 147/2026 on regional and local taxes is a substantive decree. **[S]**
- **Other August 2026 decrees** (not testi unici): D.Lgs. 148/2026 (correttivo on redditi, successioni, IVA, accise) and D.Lgs. 149/2026 (ordinamento giurisdizione tributaria). **[V]**

**Design rule:** every norm citation needs `(source act, article, version date)`, and the citing logic must pick the regime by *tax period / taxable event date*, not by today's date.

---

## 8. Scadenzario fiscale (deadline calendar)
- **Official tool:** Agenzia delle Entrate "Scadenzario fiscale", https://www1.agenziaentrate.gov.it/servizi/scadenzario/main.php (linked from the Agency home page; returns 200). **[V]**
  - Monthly lists, searchable by obligation ("adempimento") and by type of taxpayer ("contribuente").
  - No API or ICS feed was found; it would have to be scraped.
- **Shift rules:** **[S]**
  - A deadline that falls on a Saturday or holiday moves to the next working day: art. 7 DL 70/2011 and art. 18 D.Lgs. 241/1997. The TU versamenti (D.Lgs. 33/2025) restates the payment rules from 2027.
  - The August suspension of certain payments is in art. 37 c. 11-bis DL 223/2006. **[K]**
- **Legal weight:** the calendar is informational. The deadline itself comes from the norm (or a DPCM/DL proroga), so cite the norm. Check FiscoOggi and Agency news for last-minute extensions.

---

## 9. Items I could not verify (follow up before relying on them)
1. Normattiva `atto/dettaglio-atto-urn` returned error 1000 today. Search and lookup endpoints worked. The portal licence page is client-rendered; CC BY 4.0 comes from secondary sources.
2. SentenzeWeb is unreachable from this host (connection refused / certificate problem), so its current coverage window is unconfirmed.
3. The MEF tax-case-law database answers 403 to scripts. I found no 2026 update notice; the latest coverage I found is decisions up to 28/02/2025.
4. Corte costituzionale open data licence.
5. The cap of two intermediaries for the delega unica, and the 28/02/2027 end of old delegations: secondary sources only.
6. RNA self-service visura de minimis for the company itself.
7. Whether the OIC 34 tax-coordination MEF decree was adopted.
8. The release date of the testi unici concordance tables.
9. The exact text of L. 212/2000 art. 10 c. 2 and arts. 10-sexies to 10-nonies after D.Lgs. 219/2023 (fetch from Normattiva).
10. Whether OIC principles are free to download. I believe they are; confirm.
11. Annual filing deadlines for 2026/2027: confirm on the scadenzario.
12. Any testi unici approved between mid-August and October 2026: the MEF list I read showed D.Lgs. 141/2026 as the latest.
