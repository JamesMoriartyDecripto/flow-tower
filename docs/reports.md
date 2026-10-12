# Professional reports

How Flow Tower makes reports people can rely on: `flow-tower report <type> <input>` and the
[report-studio example](../examples/report-studio/README.md). Every practice here was learned on a real report (the
tower PDF of #65, the four types of #174) or comes from a source listed at the end. Sources were fetched on 2026-10-12.

## Principles

1. **Facts from code, never from a model.** Counts, scores, severities, times, totals and variances are computed by
   pure functions from the source files (`src/report/types/*`). The same input gives the same HTML: no dates, no
   randomness (the `deterministic` check renders twice and compares).
2. **Prose only where the type allows it, marked and cited.** A model may write a few paragraphs, passed in as
   `--drafts`: each carries the DRAFTED badge and `[S1]` links, must cite existing sources, and may not contain a digit
   (numbers stay in the data blocks). Claim-level checking is the direction the research takes too: RAGAS calls a
   response faithful "if all its claims can be supported by the retrieved context" [R5]; FActScore and ALCE score
   atomic claims and citations [R6, R7].
3. **Blocking checks before a file exists.** Required sections, no empty section, unique finding ids, cites that
   resolve, drafted text cited and without digits, no raw JSON (`{"`), every internal link has a target, deterministic
   output (`src/report/checks.ts`). Any failure prints every failed check and writes nothing.
4. **Look at the rendered pages.** Render to PNG (`pdftoppm`) and review every page against
   [review.md](../examples/report-studio/review.md). Anthropic's own docx skill does the same: it converts the document
   to PDF, then to images, and looks at them [R1]. On #174 two rounds of page review found about ten defects that every
   check had passed (an empty cover, sources printed twice, ids wrapping, raw timestamps, unformatted money). Each
   became a fix and a test.

## The print engine

- HTML plus print CSS, printed by headless Chromium (`page.pdf` with `preferCSSPageSize`, `printBackground`, a
  tagged PDF and an outline). `preferCSSPageSize` makes the CSS `@page` size win over the API's paper size [R8].
- `@page` margin boxes carry the running header and `counter(page) / counter(pages)`; a named page keeps them off the
  cover. "Named pages enable performing per-page layout and adding page-breaks in a declarative manner when
  printing." [R9] Margin boxes are in the CSS Paged Media draft [R10]; we rely on what Chromium prints, checked page by
  page.
- `thead { display: table-header-group }` repeats table heads; `break-inside: avoid` keeps rows and cards whole.
- Prefix every class (`rs-…`): a bare `.summary` once styled both a page-breaking section and a table cell, and a
  table printed one row per page.
- `overflow-wrap: break-word`, never `anywhere` (words broke into vertical fragments); short cells (ids, dates,
  numbers) never wrap.
- Inline SVG for charts: vector, selectable text, print colours.

## Report structure

Cover (type, title, audience, classification) · document control (type, sources with SHA-256, generator,
classification; no date) and contents on one page · numbered sections · findings as cards with an id, a severity chip
and a recommendation, closed ones muted · tables with chips for severity and RAG · a sources appendix.

Per type, the structure follows a public practice:

| Type | Practice | Source |
|---|---|---|
| Security assessment | Severity from the CVSS v4.0 qualitative bands (Low 0.1-3.9, Medium 4.0-6.9, High 7.0-8.9, Critical 9.0-10.0) | [S1] |
| Incident postmortem | Incident record, impact, mitigation and resolution, root causes, follow-up actions | [S2] |
| Cost review | Actual spend and trend, then planned against actual, then variance flags | [S3] |
| Project status | Red/amber/green per milestone and overall | convention; no standard verified |
| Tower documentation | The tower PDF of #65 | this repository |

Candidates for the next types, with their structure already checked: architecture documentation after arc42's twelve
sections and the C4 levels [S4, S5], and research reports after IMRaD [S6]. Not verified yet, so not used: PTES and
OWASP WSTG reporting sections, IIA Standard 15.1.

## Running the agents cheaply

Only two steps use a model (drafting and page review), so cost stays small. Levers:

- **Prompt caching**: the type's instructions and the sources are a stable prefix. Anthropic: "The cache is refreshed
  for no additional cost each time the cached content is used." [R2] OpenRouter passes cache control through, and
  most providers cache automatically [R4].
- **Batch** for reports that can wait: Anthropic's Message Batches cost half [R3]; the squad's overnight pace uses
  OpenRouter batches (#169).
- **Model per role**: a mid-size model drafts and reviews; extraction, layout and checks need none
  ([best-practices.md](best-practices.md) rubric line 2, [flow-tower-costs](../skills/flow-tower-costs/SKILL.md)).

## Sources

Report types:
- [S1] FIRST, [CVSS v4.0 Specification](https://www.first.org/cvss/v4.0/specification-document).
- [S2] Google, [Site Reliability Engineering, ch. 15: Postmortem Culture](https://sre.google/sre-book/postmortem-culture/), 2017.
- [S3] FinOps Foundation, [Reporting & Analytics capability](https://www.finops.org/framework/capabilities/reporting-analytics/).
- [S4] [arc42 template](https://docs.arc42.org/home/).
- [S5] [The C4 model](https://c4model.com/).
- [S6] ICMJE, [Preparing a manuscript for submission](https://www.icmje.org/recommendations/browse/manuscript-preparation/preparing-for-submission.html).

Engine and agents:
- [R1] Anthropic, [skills repository: docx skill](https://github.com/anthropics/skills).
- [R2] Anthropic, [Prompt caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching).
- [R3] Anthropic, [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing).
- [R4] OpenRouter, [Prompt caching](https://openrouter.ai/docs/features/prompt-caching).
- [R5] Ragas, [Faithfulness](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/).
- [R6] Min et al., [FActScore](https://arxiv.org/abs/2305.14251), arXiv:2305.14251, 2023.
- [R7] Gao et al., [Enabling LLMs to Generate Text with Citations (ALCE)](https://arxiv.org/abs/2305.14627), arXiv:2305.14627, 2023.
- [R8] Puppeteer, [PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions).
- [R9] MDN, [@page](https://developer.mozilla.org/en-US/docs/Web/CSS/@page).
- [R10] W3C, [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/), Working Draft, 2023.
