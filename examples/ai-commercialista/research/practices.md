# AI accountant (commercialista AI): regulatory frame and best practices

Research date: 2026-10-15. Web research only. Confidence: **H** = primary text read, **M** = several consistent secondary sources, **L** = single or secondary source, unverified. "UNVERIFIED" marks things I could not confirm.

---

## 1. Italian AI law: Legge 23 settembre 2025, n. 132

| Claim | Source | Date | Conf. |
|---|---|---|---|
| Title: "Disposizioni e deleghe al Governo in materia di intelligenza artificiale". GU Serie Generale n. 223 of 25-09-2025. **In force 10 October 2025.** | https://www.gazzettaufficiale.it/eli/id/2025/09/25/25G00143/sg | 2025-09-25 | H |
| **Art. 13 "Disposizioni in materia di professioni intellettuali"**, comma 1 (verbatim): "L'utilizzo di sistemi di intelligenza artificiale nelle professioni intellettuali è finalizzato al solo esercizio delle attività strumentali e di supporto all'attività professionale e con prevalenza del lavoro intellettuale oggetto della prestazione d'opera." | Quoted verbatim in the CNDCEC guide (section 5.2.2), https://commercialisti.it/wp-content/uploads/2025/10/2025_10_24_Laiuto-intelligente-al-commercialista_-3_DEF-2.pdf ; also https://www.finanzaefisco.com/legge-132-2025-ia-professioni-dal-10-ottobre/ | 2025-10-24 | H |
| Art. 13, comma 2 (verbatim): "Per assicurare il rapporto fiduciario tra professionista e cliente, le informazioni relative ai sistemi di intelligenza artificiale utilizzati dal professionista sono comunicate al soggetto destinatario della prestazione intellettuale con linguaggio chiaro, semplice ed esaustivo." | Same CNDCEC guide, footnote 26 (Appendice D) | 2025-10-24 | H |
| Drafting history: the Senate replaced "consentito esclusivamente" with "finalizzato al solo esercizio" (more flexible wording). | Written contribution to the Camera, https://documenti.camera.it/leg19/documentiAcquisiti/COM09/Progettodilegge/leg19.com09.Progettodilegge.Contributo%20Scritto.PUBBLICO.ideGes.59054.09-05-2025-16-22-50.425.pdf | 2025-05-09 | M |
| Applies to all intellectual professions (avvocati, notai, commercialisti, consulenti del lavoro); AI errors do not reduce the professional's personal liability (commentary). | https://www.ecnews.it/legale/mondo-professione/ai-digitalizzazione/intelligenza-artificiale-professioni-intellettuali-lobbligo-trasparenza-verso-cliente/ (G. Viani) | 2025-09-30 | M |
| Implementing decrees: on 10 June 2026 the Council of Ministers approved in preliminary reading two legislative decrees (authorities AgID/ACN + training; police biometrics, civil/criminal liability). Final adoption expected by the delega deadline (~Oct 2026). **Final status UNVERIFIED.** | https://www.noze.it/insights/decreti-attuativi-legge-ai/ | 2026 | L |

Not verified: Normattiva did not render the article text in my fetch; the wording above comes from the CNDCEC guide and finanzaefisco, which match each other.

**Design implications**: the system is a support tool for a professional, not a substitute. Every output a client relies on must pass through a professional (human-in-the-loop with sign-off). If the operator is a studio, the client must be told which AI systems are used, in plain language (art. 13 c.2). If the product is sold directly to companies without a professional, see section 2 (abusivismo) and section 3 (AI Act art. 50).

---

## 2. CNDCEC / FNC documents, deontology, who may do what

### 2a. CNDCEC + Fondazione Nazionale di Ricerca dei Commercialisti AI guides

| Claim | Source | Date | Conf. |
|---|---|---|---|
| Series "Guida operativa di intelligenza artificiale – L'aiuto intelligente al Commercialista": #1 (Oct 2024, presented in Pesaro), #2 (May/June 2025), **#3 (24 Oct 2025, presented at the Genova national congress)**. #3 by the "Commissione di studio Intelligenza artificiale e bilancio" (president Robert Braga, delegated councillor Fabrizio Escheri), 126 pages. | #1: https://www.fondazionenazionalecommercialisti.it/filemanager/active/01745/2024_10_15_Guida_operativa_di_intelligenza_artificiale_def.pdf?fid=1745 ; #2 news: https://www.fiscal-focus.it/quotidiano/altre-tematiche/infoprofessioni/commercialisti-l-aiuto-intelligente-al-commercialista-guida-sull-intelligenza-artificiale,3,173696 ; #3 PDF: https://commercialisti.it/wp-content/uploads/2025/10/2025_10_24_Laiuto-intelligente-al-commercialista_-3_DEF-2.pdf | 2024-10-15 / 2025-06 / 2025-10-24 | H (#3 read), M (#1, #2) |
| #3 Appendix D: **model clause for the mandato professionale** (art. 13 c.2): (1) AI only for ancillary purposes (document/case-law research, drafts, non-decisional content); evaluations, decisions and responsibility stay exclusively with the Professional, who exercises "controllo umano effettivo"; (2) no automated decisions under art. 22 GDPR; personal data processed under GDPR, AI Act, and the art. 13 GDPR notice; (3) on request, inform the client of tool types, purposes, and correctness/security measures; (4) **the client may ask, expressly and with reasons, that AI tools be excluded** from the engagement. | #3 PDF, Appendix D (p. 116) | 2025-10-24 | H |
| #3 short clause example: "...lo Studio si avvale di strumenti di Intelligenza Artificiale per attività di supporto, nel rispetto del principio di prevalenza del contributo umano. Si garantisce che ogni risultato generato da tali sistemi è sempre sottoposto a revisione e validazione finale da parte di un professionista." | #3 PDF, section 4.3.1 | 2025-10-24 | H |
| #3 asks for an **AI systems register** (risk class under the AI Act, purpose, GDPR legal basis), DPIA where required (GDPR art. 35), FRIA. Worked example "Ricerca giurisprudenziale con AI": risks = "citazioni inesistenti ('allucinazioni'), fonti non aggiornate"; mitigation = "controllo umano obbligatorio; divieto di inserire dati personali o sensibili nei prompt". | #3 PDF, section 4.x | 2025-10-24 | H |
| Caveat: #3 labels "Analisi contrattuale" as AI Act "rischio alto". That is the guide's own judgement; Annex III does not list contract analysis (see section 3). Do not copy it as law. | Own reading of Annex III vs. #3 | - | M |
| Codice deontologico links cited by #3: art. 8 (competence and diligence; c.2 no engagements without competence; c.5 continuing training), art. 10 (absolute confidentiality), art. 22 (explain to the client essential elements and risks of the engagement), art. 4 (proportional sanctions). Regolamento sul Sigillo professionale: art. 8 (seal used "personalmente ed esclusivamente dal legittimo detentore"), art. 13 (sealing implies full responsibility for content). | #3 PDF, sections 5.3-5.5 | 2025-10-24 | H (as cited by #3; Codice text itself not read) |
| No 4th guide and no Codice deontologico revision on AI found as of Oct 2026. | Searches | 2026-10 | L (absence) |
| Wolters Kluwer built the One FISCALE AI "professional board" together with the CNDCEC. | https://www.wolterskluwer.com/it-it/solutions/one/onefiscale-ai/professional-board | - | L |

### 2b. Reserved activities, abusivismo, filing

| Claim | Source | Date | Conf. |
|---|---|---|---|
| **Art. 348 c.p.** (esercizio abusivo di una professione). Cass. pen. **Sez. Unite n. 11545/2012** (dep. 23 Mar 2012): performing acts not exclusively reserved can still be the crime if done continuously, for pay and with minimal organisation so as to look like the licensed profession's activity. For bookkeeping/tax returns the SS.UU. found no crime under the pre-2005 rules (DPR 1067-1068/1953), indicating a different answer for the esperto contabile under D.Lgs. 139/2005. | https://brocardi.it/massimario/35068.html ; https://www.studiocerbone.com/?p=17418 | 2012-03-23 | M |
| Later: Cass. pen. 10100/2011 (labour consultant giving tax/accounting assistance convicted); Cass. civ. ord. 3495/2024 held that consulenti del lavoro can also do those accounting/tax activities. The area is contested; tax consulting **as such is not a reserved activity** for commercialisti, but a structured, paid service presented as professional work carries art. 348 risk. | https://www.studiocataldi.it/articoli/9885-cassazione-commette-reato-consulente-del-lavoro-che-presta-assistenza-fiscale-se-non-abilitato.asp ; https://www.studiocerbone.com/?p=483883 | 2011 / 2024 | M |
| **Visto di conformità**: art. 35 D.Lgs. 241/1997 reserves it to professionals of art. 3 c.3 lett. a) and b) DPR 322/1998 (commercialisti, ragionieri, periti commerciali, consulenti del lavoro; certain pre-1993 tax experts) and CAF; registered with the Direzione regionale (art. 21 DM 164/1999); identity required between who affixes the visto and who prepares and transmits (Ris. 99/E/2019, Risposta 87/2022). Telematic filing via **intermediari abilitati** (Entratel) under art. 3 c.3 DPR 322/1998; not every intermediary may affix the visto (Cons. Stato 6028/2012). | https://www.quotidianopiu.it/dettaglio/10593914/e-omesso-il-visto-apposto-da-soggetto-non-autorizzato ; https://ntplusfisco.ilsole24ore.com/art/visto-conformita-e-modelli-anche-soggetti-differenti-ACtucQMB ; https://www.studiocerbone.com/?p=430221 | various | M |
| "An AI cannot sign or file": no source states it in those words. It follows from the above: visto, asseverazioni, Entratel filing and the professional seal are personal to an authorised natural person or entity (Sigillo reg. art. 8 per CNDCEC #3). Treat it as a **derived design rule, not a quoted norm**. | Derived | - | M (inference) |

**Design implications**: the system drafts, explains and proposes; a named professional reviews, signs, affixes the visto and files. If sold to companies without a professional in the loop, keep it to information and decision support ("informazione", not "consulenza personalizzata"), and route each actionable recommendation to a professional. Get legal advice on art. 348 exposure before selling direct-to-company "consulenza".

---

## 3. EU AI Act (Reg. (EU) 2024/1689) and the Digital Omnibus

| Claim | Source | Date | Conf. |
|---|---|---|---|
| **Annex III** lists 8 areas (biometrics, critical infrastructure, education, employment, essential services, law enforcement, migration, justice/democracy). **No tax, accounting or professional-advice use case.** Nearest: 5(b) creditworthiness of natural persons (credit scoring), 5(c) life/health insurance pricing, 8(a) AI used *by or on behalf of a judicial authority*. A tax-advice assistant for companies is therefore **not high-risk by default**, unless it is used for one of those purposes (e.g., scoring individuals' creditworthiness). | https://artificialintelligenceact.eu/annex/3/ | - | H |
| Art. 6(3): Annex III systems escape high-risk if they pose no significant risk (narrow procedural task; improving a completed human activity; detecting patterns without replacing human assessment; preparatory task). Never if they profile natural persons. Art. 6(4): document the assessment. | https://artificialintelligenceact.eu/article/6/ | - | H (original text; check Omnibus amendments) |
| **Art. 50(1)**: providers must design systems that interact with people so those people know they are interacting with AI (unless obvious). 50(2): machine-readable marking of synthetic text/audio/image/video. 50(4): deployers publishing AI-generated text "to inform the public on matters of public interest" must disclose it (unless there is human editorial review and editorial responsibility). 50(5): information at the latest at first interaction. | https://artificialintelligenceact.eu/article/50/ | - | H |
| Art. 50 applies from **2 August 2026** (not postponed). | Gibson Dunn https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/ ; https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html | 2026-05-27 | M-H |
| **Digital Omnibus on AI = Regulation (EU) 2026/1744** (8 Jul 2026), OJ 24 Jul 2026, in force 27 Jul 2026. Annex III high-risk obligations from **2 Dec 2027**; Annex I (product-embedded) from **2 Aug 2028**; grace period to **2 Dec 2026** only for the art. 50(2) marking duty for generative systems already on the market before 2 Aug 2026; art. 4 AI literacy softened (providers/deployers "support" literacy instead of ensuring it); new art. 5 bans (non-consensual intimate imagery/CSAM) from 2 Dec 2026. Political agreement 6 May 2026, Council confirmation 13 May 2026. | https://ertico.com/digital-omnibus-on-ai-enters-into-force (2026-08-07); Gibson Dunn above; EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601744 ; consolidated: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02024R1689-20260727 | 2026-07/08 | M (EUR-Lex page did not render for me; numbers agree across several firms) |
| Commission **Code of Practice on Transparency of AI-Generated Content**: final 10 Jun 2026; Commission opinion 8 Jul 2026 that it adequately covers art. 50(2), (4), (5). Art. 50 **guidelines**: reported as C(2026) 5054 of 20 Jul 2026 by one source, still "draft" in others. **Guidelines status UNVERIFIED.** | https://www.jonesday.com/en/insights/2026/06/european-commission-publishes-final-code-of-practice-on-marking-and-labelling-aigenerated-content ; https://techpolicy.press/the-eus-ai-transparency-code-of-practice-explained ; https://ppc.land/eu-ai-content-rules-force-publishers-to-label-or-risk-3-of-turnover/ | 2026-06/07 | M / L |

**Design implications**: classify as limited-risk (transparency) and record the classification and reasons in the AI register. Show an AI disclosure at the first interaction. Mark generated documents (opinions, memos) as AI-assisted plus professional-validated. Do not add creditworthiness scoring of natural persons (that would be Annex III 5(b)). Train staff (art. 4 literacy).

---

## 4. GDPR, professional secrecy, AML, abuse of law, DAC6, interpello, cooperative compliance

### 4a. GDPR and secrecy

| Claim | Source | Date | Conf. |
|---|---|---|---|
| Art. 5 D.Lgs. 139/2005: commercialisti are bound by professional secrecy; arts. 199-200 c.p.p. and 249 c.p.c. apply (except statutory audit/certification and sindaco roles). Art. 622 c.p. punishes disclosure of a professional secret. Codice deontologico art. 10: "assoluto riserbo". | https://www.ecnews.it/fiscale/accertamento-e-contenzioso/accertamento/segreto-professionale-nellambito-delle-verifiche-fiscali/ ; CNDCEC #3 section 5.4.2 | - | M |
| EDPB **Opinion 28/2024** (17 Dec 2024) on AI models: anonymity is assessed case by case; legitimate interest is not a default basis and needs a three-step test plus safeguards. | https://cms.law/en/int/legal-updates/edpb-opinion-28-2024-key-takeaways-on-processing-personal-data-in-the-context-of-ai-models | 2024-12-17 | M |
| EDPB Support Pool of Experts, "AI Privacy Risks & Mitigations – Large Language Models" (Apr 2025, I. Barberá); not an official EDPB position. | https://www.edpb.europa.eu/our-work-tools/our-documents/support-pool-experts-projects/ai-privacy-risks-mitigations-large_en | 2025-04-10 | H |
| Garante fine of €15M on OpenAI (provv. 755 of 2 Nov 2024, announced 20 Dec 2024) was **annulled by the Tribunale di Roma (18 Mar 2026)** on competence grounds (one-stop-shop, Irish DPC lead), not on the merits. Case number cited as 4153/2026 by the Garante and as R.G. 4785/2025 elsewhere. | https://www.garanteprivacy.it/home/docweb/-/docweb-display/print/10085432 ; https://www.cybersecurity360.it/legal/privacy-dati-personali/chi-governa-lai-il-tribunale-annulla-la-sanzione-a-openai-e-ridefinisce-i-confini-del-garante-privacy/ | 2026-03-18 | M |

**Design implications**: the studio is the controller; the model vendor is a processor (art. 28 DPA, no training on client data, EU or SCC-covered region, zero data retention where available). Minimise and pseudonymise what goes into prompts (CNDCEC #3 says no personal or sensitive data in prompts for research tasks). Run a DPIA. Keep an audit log of retrieved sources and outputs per client, with access controls consistent with secrecy. Art. 22 GDPR: no solely automated decisions with legal effects.

### 4b. Anti-money laundering (D.Lgs. 231/2007)

| Claim | Source | Date | Conf. |
|---|---|---|---|
| Commercialisti are obliged parties: risk self-assessment, **adeguata verifica** (CDD), record retention, **SOS** (segnalazione operazioni sospette). CNDCEC updated **Regole Tecniche** under art. 11 c.2 on **16 Jan 2025** (in force immediately). | https://edotto.com/articolo/nuove-regole-tecniche-antiriciclaggio-2025-aggiornamenti-e-semplificazioni-per-i-commercialisti | 2025-01 | M |
| Art. 35: report to UIF "senza ritardo", before executing, when they know, suspect or have reasonable grounds to suspect. Art. 39: **tipping-off ban** (no disclosure to the client or third parties that an SOS was made); c.6: trying to dissuade a client from an illegal activity is not tipping-off. | https://www.fisco7.it/wp-content/uploads/art._39_DettaglioArticolo.pdf ; https://www.mysolution.it/fisco/approfondimenti/commenti/20232/09/segnalazioni-antiriciclaggio-novita-per-i-commercialisti-urbano | - | M |
| **UIF new SOS instructions**, provv. 18 Dec 2025 (GU n. 302 of 31 Dec 2025), apply from **1 Jul 2026**, replacing the 4 May 2011 provision; qualitative assessment, document decisions not to report, SOS contact person; AI allowed with human validation (per commentary). Omitted SOS: €3,000 to €300,000 (art. 58). | https://www.fiscal-focus.it/antiriciclaggio-nuove-regole-uif-sos-1-luglio-2026,3,180261 ; https://www.pmi.it/professioni/investimenti-e-affari/496604/antiriciclaggio-nuove-regole-uif-sos-professionisti.html ; https://www.agendadigitale.eu/procurement/ai-e-antiriciclaggio-nuove-regole-come-cambia-la-segnalazione-di-operazioni-sospette/ | 2025-12 / 2026 | M |

**Design implications**: the AI must not weaken AML. Optimisation proposals must never help structure transactions to avoid thresholds or CDD. Detected anomaly indicators (UIF indicators of 12 May 2023) go to the professional's internal channel, never to the client (art. 39). The AI never decides about an SOS. Log the decision trail.

### 4c. Abuse of law / elusione: art. 10-bis L. 212/2000

| Claim | Source | Date | Conf. |
|---|---|---|---|
| c.1: "Configurano abuso del diritto una o più operazioni prive di sostanza economica che, pur nel rispetto formale delle norme fiscali, realizzano essenzialmente vantaggi fiscali indebiti." Not opposable to the tax authority. c.2: definitions (no economic substance; undue advantage = contrary to the purpose of the rules or to principles of the system). c.3: not abusive if justified by valid non-tax reasons, not marginal (organisational/managerial). **c.4: "Resta ferma la libertà di scelta del contribuente tra regimi opzionali diversi offerti dalla legge e tra operazioni comportanti un diverso carico fiscale."** c.5: interpello under art. 11 c.1 lett. c). c.9: the tax authority proves abuse; the taxpayer proves the non-tax reasons. c.12: abuse only if the advantage cannot be denied as a specific violation. c.13: abusive operations are not punishable under the criminal tax laws (administrative sanctions remain). | Text as of D.Lgs. 156/2015 (vers. in force 1 Jan 2016): https://www.unipa.it/dipartimenti/di.gi./specializzazioni/professionilegali/.content/documenti/10-bis.pdf ; current text: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2000-07-27;212 | 2015/2016 | H for c.1-5 and 9 (read); commi 6-8 may have been amended by D.Lgs. 219/2023 (contraddittorio): UNVERIFIED |

**Design implications**: every optimisation proposal should carry a risk label: (a) a regime choice or option expressly offered by law (c.4, low risk); (b) a transaction with a tax advantage plus documented non-tax reasons (c.3, medium risk: list the reasons and the evidence needed); (c) an advantage that is the essential purpose, without substance (c.1-2, abuse risk: block it or route it to the professional, and suggest an anti-abuse interpello). Never present (c) as a recommendation.

### 4d. DAC6 (cross-border arrangements)

| Claim | Source | Date | Conf. |
|---|---|---|---|
| Italy transposed Dir. 2018/822 with **D.Lgs. 100/2020**; DM 17 Nov 2020; Agenzia Entrate **Circ. 2/E/2021**. Intermediaries (incl. commercialisti) report first, then taxpayers. Hallmarks A-E; main benefit test for some. Ordinary deadline **30 days** from availability or implementation or from the assistance given. From 1 Jan 2026, D.Lgs. 194/2025 (DAC8 transposition) amends intermediary obligations under professional secrecy. | https://fiscomania.com/comunicazione-dac6/ ; https://www.ecnews.it/fiscale/fisco-e-patrimonio/fisco-internazionale/le-scadenze-delle-comunicazioni-dac6-dopo-la-circolare-2-e-2021/ ; https://www.agenziaentrate.gov.it/portale/documents/20143/3140546/22_Gruppo+di+studio+DAC+6.pdf/27e0b10e-5067-e05c-8816-33a15e10d7ff | 2020-2026 | M; sanction amounts (art. 12) UNVERIFIED; DAC8 change L |

**Design implications**: if a proposal has any cross-border element, run a hallmark checklist (A-E). If any hallmark hits, flag "possible DAC6 reportable arrangement: 30-day clock" for the professional.

### 4e. Interpello and adempimento collaborativo

| Claim | Source | Date | Conf. |
|---|---|---|---|
| Art. 11 Statuto rewritten by **D.Lgs. 219/2023** (in force 18 Jan 2024): types interpretativo/qualificatorio, probatorio, antiabuso, disapplicativo. Under the 2015 framework: 90 days for ordinary, 120 days for the others, **silenzio-assenso** if no answer; must be filed before the relevant deadline. A fee for "fattispecie particolarmente complesse" was introduced but reported **not operational**; D.Lgs. 192/2025 (third corrective) touched access limits and the fee. Current deadlines after 219/2023: **UNVERIFIED** (check Normattiva). | https://www.ecnews.it/fiscale/accertamento-e-contenzioso/istituti-deflattivi/la-nuova-mappa-degli-interpelli/ (2015 framework); https://www.fiscoetasse.com/approfondimenti/17400-interpelli-a-pagamento-2026-chi-paga-quanto-costa-e-come-funziona.html ; https://www.bdo.it/getattachment/acf9a558-bff3-48cb-bdb8-ac4c39aa6366/Tax-New-2024-statuto-e-contenzioso_def_.pdf?lang=it-IT | 2015 / 2024-2026 | M (types), L (current deadlines and fee) |
| Art. 10-bis c.5: anti-abuse interpello is the route to know in advance whether an operation is abusive. | 10-bis text above | - | H |
| **Adempimento collaborativo** (D.Lgs. 128/2015, reformed by D.Lgs. 221/2023 and D.Lgs. 108/2024): revenue threshold €750M from 2024, **€500M from 2026**, €100M from 2028; tax control framework (TCF) certified by qualified professionals; Agenzia Circ. 6/E/2026 on the new rules. "Optional TCF regime for smaller firms": **UNVERIFIED**. | https://fiscomania.com/adempimento-collaborativo/ ; https://www.money.it/adempimento-collaborativo-e-ravvedimento-guidato-i-chiarimenti-delle-entrate ; https://www.studiocerbone.com/la-nuova-disciplina-delladempimento-collaborativo-dopo-la-circolare-n-6-e-del-2026-tax-control-framework-certificazione-e-sistema-premiale-nella-riforma-tributaria/ | 2023-2026 | M |

**Design implications**: when the source support is uncertain (conflicting practice, no prassi, novel facts), the system should say "uncertain" and propose an interpello (with type and timing) instead of a confident answer. For clients in or near the cooperative compliance thresholds, map the AI's controls into their TCF (risk register, escalation, logs).

---

## 5. Hallucination evidence and grounded-citation best practices

### 5a. Evidence

| Claim | Source | Date | Conf. |
|---|---|---|---|
| **Magesh, Surani, Dahl, Suzgun, Manning, Ho, "Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools"**: preregistered evaluation; Lexis+ AI, Westlaw AI-Assisted Research, Ask Practical Law AI hallucinate **17%-33%** of the time (less than GPT-4, but vendors' "hallucination-free" claims are overstated). arXiv 2405.20362 (30 May 2024); *Journal of Empirical Legal Studies* 22 (2025) 216-242, DOI 10.1111/jels.12413. | https://arxiv.org/abs/2405.20362 ; https://law.stanford.edu/publications/hallucination-free-assessing-the-reliability-of-leading-ai-legal-research-tools ; https://isps.yale.edu/research/publications/isps25-33 | 2024/2025 | H |
| **Dahl et al., "Large Legal Fictions"** (*Journal of Legal Analysis* 16, 2024): general LLMs hallucinate on verifiable US case-law questions **at least 58%** (journal), 69%-88% (preprint); they fail to correct false premises and cannot predict their own hallucinations. | https://arxiv.org/abs/2401.01301 ; https://law.stanford.edu/publications/large-legal-fictions-profiling-legal-hallucinations-in-large-language-models | 2024 | H |
| **Nay et al., "Large Language Models as Tax Attorneys"** (arXiv 2306.07075, Jun 2023; Phil. Trans. R. Soc. A): accuracy improves with each model generation and with retrieval of the correct legal text plus few-shot prompting; high but "not yet at expert tax lawyer levels". | https://arxiv.org/abs/2306.07075 | 2023 | H |
| **SteuerLLM / SteuerEx** (German tax law; 115 expert-validated exam questions; *Scientific Reports* 16, 2026): a domain-adapted 28B model beats general models of similar size; strict grading of statute citation and calculations. | https://arxiv.org/abs/2602.11081 | 2026-02 | H (abstract) |
| **TaxPraBen** (Chinese tax practice benchmark, 19 LLMs). | https://arxiv.org/html/2604.08948 | 2026-04 | L |
| Italian-language resources: **CALAMITA** (CLiC-it 2024) incl. AMELIA (argument mining on 225 Italian **VAT** decisions); **JuriFindIT** (EACL 2026 Findings: 895 expert questions, ~23k Italian statutory articles incl. AML and privacy); **LegalITA** (Aptus-AI, case-law reasoning incl. false-premise tests). No Italian tax QA benchmark with published model scores found. | https://aclanthology.org/2024.clicit-1.116 ; https://preview.aclanthology.org/credits/2026.findings-eacl.221 ; https://github.com/Aptus-AI/LegalITA | 2024-2026 | M |
| Washington Post test (G. Fowler, Mar 2024): TurboTax (Intuit Assist) and H&R Block AI Tax Assist chatbots were "unhelpful or wrong" about half the time. | https://www.nysscpa.org/news/publications/the-trusted-professional/article/tech-columnist-turbotax-and-hrblock-chatbots-are-unhelpful-or-wrong-much-of-the-time-030724 | 2024-03 | M |
| Charlotin "AI Hallucination Cases" database: ~1,624 court decisions worldwide by 18 Jun 2026 (secondary count). | https://www.damiencharlotin.com/hallucinations/ ; https://library.law.unc.edu/2026/06/handling-hallucinations-a-reflection/ | 2026-06 | M |

### 5b. Italian courts on hallucinated citations

| Case | Source | Conf. |
|---|---|---|
| **Trib. Firenze, Sez. Imprese, ord. 14 Mar 2025 (reclamo R.G. 11053/2024)**: nonexistent judgments cited after unverified ChatGPT research; **no** art. 96 c.p.c. sanction (no bad faith or gross fault, no proven harm), but a widely cited warning. | https://www.diritto.it/intelligenza-artificiale-atti-difensivi-allucinazio/ ; https://ntplusdiritto.ilsole24ore.com/art/l-errore-chatgpt-memoria-difensiva-non-comporta-condanna-lite-temeraria-AG9QyXlD | M |
| **Trib. Torino 16 Sep 2025** and **Trib. Latina 23/24 Sep 2025 nn. 1034-1035**: art. 96 c.3 c.p.c. condemnation for AI-drafted, irrelevant filings (Latina: €1,000 to the other party + €1,000 to cassa ammende). | https://www.rivistalabor.it/wp-content/uploads/2025/11/Trib.Latina-23-settembre-2025-n.-1034.pdf ; https://ntplusdiritto.ilsole24ore.com/art/l-accountability-nell-uso-dell-ia-casi-affrontati-autorita-e-obblighi-trasparenza-legge-italiana-sull-ia-AH9RQG9C | M |
| **TAR Lombardia, Sez. V, sent. 3348 of 21 Oct 2025**: nonexistent/irrelevant precedents; ruling sent to the Milan Bar Council for disciplinary review (art. 88 c.p.c. via art. 39 c.p.a.). | https://www.diritto.it/responsabilita-dellavvocato-e-ia-il-monito-del-tar/ | M |
| **Trib. Siracusa 20 Feb 2026 n. 338**: unchecked AI-generated nonexistent precedents treated as gross negligence. | https://iusletter.com/?p=253906 | L |
| Cass. pen. Sez. III (Oct 2025) annulled a Corte d'Appello di Torino judgment citing principles never stated and wrong case numbers; no explicit AI finding (commentators suspect AI). | https://www.cybersecurity360.it/news/le-sentenze-fantasma-arrivano-in-cassazione-e-fanno-dubitare-della-giustizia/ | L |
| International reference: Mata v. Avianca (S.D.N.Y. 2023), $5,000 sanction. | via https://www.agendadigitale.eu/?p=229843 | M |

### 5c. Grounded-citation techniques (literature)

- Decompose answers into atomic claims and verify each one against one source. Multi-source support complicates checking. *Extractive-Abstractive Spectrum*, https://arxiv.org/pdf/2411.17375 (2024). M
- NLI-based citation checking before final output improves citation quality without hurting correctness: **VeriCite** (SIGIR-AP 2025), https://arxiv.org/html/2510.11394v1. M
- Better retrieval alone does not fix unfaithful citations (only 27-41% of citation pairs supported in a medical QA study), https://aclanthology.org/2026.bionlp-1.62/. M
- NLI evaluators give false entailment when cited documents are incomplete, https://www.iccs-meeting.org/archive/iccs2025/papers/159110235.pdf. M

### 5d. Recommended practice for the system (synthesis, not a quoted source)

1. **Retrieve, then answer.** Answer only from retrieved primary sources (Normattiva texts *in the version in force for the tax year*, Agenzia Entrate circolari/risoluzioni/risposte a interpello, Cassazione, CNDCEC/FNC documents) plus labelled secondary doctrine.
2. **Quote spans.** Every claim links to an exact quoted span (use API-native citations, section 7) and to an official URL with article and comma.
3. **Verify citations mechanically.** Resolve every cited norm or ruling against the source index (does it exist, does the quoted text occur in it, which version, still in force). Run an NLI/LLM-judge check that the span supports the claim. Drop or flag unsupported claims.
4. **Temporal validity.** Each answer states the tax year and period of reference; check multivigenza (e.g., the Statuto after D.Lgs. 219/2023, interpello after D.Lgs. 192/2025, the AI Act after Reg. 2026/1744).
5. **Refuse or escalate** when no source supports the answer, when sources conflict, or when the matter is novel; propose an interpello.
6. **Confidence and risk labels** per proposal: source strength, abuse risk (10-bis), DAC6 flag, AML flag.
7. **Human review and sign-off** by a named professional before anything reaches the client or the Agenzia (L. 132/2025 art. 13; CNDCEC clause).
8. **Disclosure** (art. 13 c.2 L. 132/2025; AI Act art. 50(1)) and client opt-out (CNDCEC clause point 4).
9. **Audit log**: question, retrieved sources and versions, output, reviewer, decision; kept under professional secrecy.
10. **Evaluate**: a held-out Italian tax Q&A set with expert answers, false-premise items (cf. LegalITA, Large Legal Fictions) and citation-existence checks; track the hallucination rate per release.

---

## 6. Products (claims about citations only)

| Product | What it claims about citations/grounding | Source | Conf. |
|---|---|---|---|
| **Wolters Kluwer One FISCALE AI** (IPSOA) | Generative AI over WK's proprietary content: quick answers, draft opinions; "human in the loop" in development and output verification; professional board with CNDCEC. **I found no explicit per-answer citation claim** (product pages paywalled/SSO). In Jun 2026, One FISCALE content was integrated into WK's Libra AI workspace. | https://wolterskluwer.com/it-it/solutions/one/onefiscale ; https://www.ipsoa.it/magazine/one-fiscale-ai-ai-per-professionisti-fiscali-aziende-garantita-wolters-kluwer ; https://www.ipsoa.it/documents/quotidiano/2026/06/11/libra-workspace-by-wolters-kluwer-arricchisce-contenuti-one-fiscale | M |
| **Gruppo 24 Ore**: Smart24 Fisco AI (brochure Apr 2025), Top24 Fisco AI, Valore24 AI Office; older "Alf" assistant in Plusplus24 Fisco (IBM Watson) | Answers based on 24 Ore editorial databases ("autorevoli"); **no explicit citation mechanism described** in the brochure. The product name "Plus Plus 24 Fisco AI" was not confirmed. | https://minisiti.ilsole24ore.com/250404_Brochure_new/SMART24_FISCO_AI_BROCHURE_DIGITAL.pdf ; https://ntplusfisco.ilsole24ore.com/art/alf-arriva-l-assistente-virtual-i-professionisti-fisco-AFiP1TB | M |
| **Lefebvre Giuffrè**: Sapient-IA (Apr 2025); GenIA-L (Lefebvre Sarrut group) | Answers "esclusivamente su fonti autorevoli e certificate" of the publisher; human in the loop (press releases). | https://quotidianopiu.it/dettaglio/11338734/nuovo-brand-e-lancio-di-sapient-ia-il-nuovo-sistema-di-ia-generativa ; https://www.lefebvre-sarrut.eu/en/?p=1229 | M (vendor claims) |
| **TeamSystem**: TeamSystem Studio AI, ViaLibera (with Euroconference); webinar "Normo.AI" (Jul 2026) | Mostly automation (bookkeeping, document retrieval from the AdE portal) plus AI content platform; **no citation claim found**. "TeamSystem AI" as a single product name not confirmed. | https://www.teamsystem.com/commercialisti/teamsystem-vialibera/ ; https://www.teamsystem.com/magazine/gestione-dello-studio/intelligenza-artificiale-commercialisti/ | L |
| **Blue J** (US/CA/UK tax) | Cites only materials in its curated library, inline at the point of analysis, with passages highlighted; says "I don't know" when unsupported. No independent audit found. | https://bluej.com/ca/ask-bluej ; https://www.bluej.com/uk/how-it-works-ad | M (vendor claims) |
| **Thomson Reuters CoCounsel Tax / Checkpoint Edge** | Answers with embedded citations to IRS publications, code, regulations, case law and Checkpoint content; "grounded in curated, vetted" content. No independent audit for tax (the Stanford study covered TR's *legal* tools: 17-33%). | https://tax.thomsonreuters.com/en/accounting-solutions/c/get-accurate-tax-answers-in-seconds-not-hours ; https://www.accountingtoday.com/news/checkpoint-edge-released-by-thomson-reuters-with-ai-assisted-research-feature | M |
| **Intuit Assist (TurboTax)** | Mix of generated answers and links to TurboTax pages; no formal citation of authority; poor results in the 2024 WaPo test. | NYSSCPA link in 5a | M |

Takeaway: Italian vendors claim "fonti autorevoli" (closed editorial corpus) and human in the loop. Span-level citation with verification is publicly claimed mainly by Blue J and TR. Independent tests (Stanford) show closed-corpus RAG still hallucinates 17-33% in law, so verification and review stay necessary.

---

## 7. LLM vendor citation features (current names)

| Claim | Source | Date | Conf. |
|---|---|---|---|
| **Anthropic "Citations"** (GA on the Claude API, Bedrock, Vertex/Google Cloud, Microsoft Foundry): set `citations: {"enabled": true}` on `document` blocks. Location types: `char_location` (plain text), `page_location` (PDF), `content_block_location` (custom content). Each citation carries `cited_text`, which does not count toward output tokens. "citations are guaranteed to contain valid pointers to the provided documents". **Incompatible with structured outputs** (`output_config.format`, 400 error). Works with prompt caching and batch. All active models are supported. | https://platform.claude.com/docs/en/build-with-claude/citations | read 2026-10-15 | H |
| **Search result content blocks** (`type: "search_result"`, fields `source`, `title`, `content[]`, optional `citations`), returned from custom tools (`tool_result`) or as top-level content; citations come back as `search_result_location`. Standard Messages API, no beta header; all active models except Claude Haiku 3. Citations are all-or-nothing across search results in one request; a `tool_result` containing a `search_result` may contain only `search_result` blocks. | https://platform.claude.com/docs/en/build-with-claude/search-results | read 2026-10-15 | H |
| Launch post "Introducing Citations on the Anthropic API": internal evals, "increasing recall accuracy by up to 15%" vs custom implementations; Endex: source hallucinations and formatting issues "from 10% to 0%". The page is dated 23 Jun 2025 on claude.com, but press coverage is from **Jan 2025** (the-decoder, 25 Jan 2025), so the launch was ~Jan 2025 and the page date is probably a re-publication. | https://claude.com/resources/articles/introducing-citations-api ; https://the-decoder.com/anthropic-adds-source-citations-to-claude-models/ | 2025 | H (claims), M (date) |
| Cookbook: https://platform.claude.com/cookbook/misc-using-citations | | | H |
| **OpenAI Responses API**: output text `annotations[]` with `file_citation` (file_search tool: file_id, filename, index), `url_citation` (web search: start_index, end_index, title, url), `container_file_citation`, `file_path`. | https://developers.openai.com/api/reference/resources/responses | 2026 | M |

**Design implications**: put each retrieved norm or document chunk in a `search_result` block, with `source` = official URL plus article/comma and `title` = norm + version date. Let Claude cite natively. Since citations and structured outputs cannot be combined, do the answer with citations in one call and the structured risk labels in a separate call (or parse afterwards). Then verify each `cited_text` against the source index and the version in force.

---

## Open items / could not verify

- Normattiva official text of art. 13 L. 132/2025 (wording verified via the CNDCEC guide and one news site).
- Final adoption of the L. 132/2025 implementing decrees (preliminary approval 10 Jun 2026).
- Commission Article 50 guidelines: final (C(2026) 5054?) or draft.
- Current art. 11 Statuto deadlines and interpello fee after D.Lgs. 219/2023 and 192/2025; commi 6-8 of art. 10-bis after 219/2023.
- DAC6 sanction amounts (art. 12 D.Lgs. 100/2020) and the exact D.Lgs. 194/2025 changes.
- Per-answer citation behaviour of One FISCALE AI and Smart24 Fisco AI (would need product access).
- Whether an "optional TCF regime" for firms below the cooperative-compliance threshold exists.
- The Garante/OpenAI judgment number (4153/2026 vs R.G. 4785/2025).
