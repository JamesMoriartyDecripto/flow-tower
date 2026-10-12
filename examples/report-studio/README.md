# Report Studio

Professional reports of any type from your own sources, as PDF: security assessments, project status, incident
postmortems, cost reviews, and the documentation of a tower. It is the method of
[issue #174](https://github.com/JamesMoriartyDecripto/flow-tower/issues/174), built on what the tower PDF of
[#65](https://github.com/JamesMoriartyDecripto/flow-tower/issues/65) taught: facts from code, blocking checks before a
file is written, and a look at every rendered page. Practices and sources: [docs/reports.md](../../docs/reports.md).
The [flow-tower-report skill](../../skills/flow-tower-report/SKILL.md) walks an agent through it.

## What it shows

| Layer | What happens there |
|---|---|
| 1 · Intake | Type, audience, source files ([samples/](samples)) |
| 2 · Outline | The type's template: its required sections (`flow-tower report --list`) |
| 3 · Extraction (scripted) | Counts, CVSS bands, RAG, durations, variances: code only; contradictory input stops the run |
| 4 · Drafting (optional) | A model may write the prose the type allows: marked DRAFTED, citing sources, no digits ([drafts/status.json](drafts/status.json)) |
| 5 · Layout | One engine: HTML and print CSS, printed by headless Chromium (tagged PDF, outline) |
| 6 · Blocking checks | Sections, ids, cites, digits in drafts, raw data, links, determinism: any failure, no file |
| 7 · Review | Every page as PNG, against [review.md](review.md); each problem becomes a check or a test |
| 8 · Delivery | The PDF ([output/](output)), signed off by a person |

## Run it

```bash
npx playwright install chromium                         # once: the print engine
node bin/flow-tower.js report --list                    # the types and their required sections
cd examples/report-studio
node ../../bin/flow-tower.js report security-assessment samples/security.yaml --out output/security.pdf
node ../../bin/flow-tower.js report project-status samples/status.yaml --drafts drafts/status.json --out output/status.pdf
node ../../bin/flow-tower.js report postmortem samples/postmortem.yaml --out output/postmortem.pdf
node ../../bin/flow-tower.js report cost-review samples/cost.yaml --out output/cost.pdf
node ../../bin/flow-tower.js report tower-documentation ../dev-squad --level 2 --out output/dev-squad.pdf   # the #65 PDF, slow without a GPU
```

`--html file.html` writes the HTML too; `--source file` adds a supporting source (S2, S3…) with its SHA-256.

## Report types

| Type | Input | Built from |
|---|---|---|
| `security-assessment` | scope, methodology, findings with CVSS scores | Severity from the [CVSS v4.0](https://www.first.org/cvss/v4.0/specification-document) qualitative bands; a severity that disagrees with its score stops the run |
| `project-status` | milestones, risks, decisions, budget | Red/amber/green status per milestone and overall; budget variance computed |
| `postmortem` | timestamps, impact, timeline, causes, actions, lessons | The postmortem practice of the [Google SRE book](https://sre.google/sre-book/postmortem-culture/); times to detect, mitigate, resolve computed |
| `cost-review` | spend per service with budget and previous period | The [FinOps Framework](https://www.finops.org/framework/capabilities/reporting-analytics/) reporting capability: totals, shares, variance flags |
| `tower-documentation` | a tower or a folder of towers | The tower PDF of #65 (`flow-tower export`) |

A new type is one file in `src/report/types/`: parse the input, build the document, name the required sections.

## Samples

All inputs in [samples/](samples) are **illustrative**: fictional companies, hosts, people, dates and amounts. The PDFs
in [output/](output) were generated from them with the commands above.

## Sources

[FIRST CVSS v4.0](https://www.first.org/cvss/v4.0/specification-document) (security severity bands),
[Google SRE book, Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) (postmortem structure),
[FinOps Framework, Reporting & Analytics](https://www.finops.org/framework/capabilities/reporting-analytics/) (cost
review), [Anthropic skills](https://github.com/anthropics/skills) (review by rendering pages),
[MDN @page](https://developer.mozilla.org/en-US/docs/Web/CSS/@page) (page margin boxes, named pages). The full list,
with what each one supports, is in [docs/reports.md](../../docs/reports.md). Model ids and the budget in the tower are
illustrative defaults.
