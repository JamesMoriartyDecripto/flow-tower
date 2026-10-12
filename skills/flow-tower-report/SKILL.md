---
name: flow-tower-report
description: Make a professional PDF report from the user's own sources with `flow-tower report` - security assessment, project status, incident postmortem, cost review, or the documentation of a Flow Tower. Use when the user asks for a report, an assessment write-up, a status report, a postmortem, a spend review or a PDF of their tower; facts come from code, prose from a model only where allowed, checked before the file is written.
---

# Flow Tower: make a report

CLI: `{{FLOW_TOWER_CLI}}` (setup in the [flow-tower skill](../flow-tower/SKILL.md)). The method is drawn as the
[report-studio example](../../examples/report-studio/README.md); practices and sources in
[docs/reports.md](../../docs/reports.md). Printing needs a Playwright browser: `npx playwright install chromium`.

## 1 · Intake

- `{{FLOW_TOWER_CLI}} report --list`: pick the type with the user; tell them its required sections.
- Who reads it (audience), its classification (public, internal, confidential).
- Which files are the sources. Nothing goes to a model unless the user agrees (step 4).

## 2 · Prepare the input

Write the type's input file (YAML) from the user's sources, copying the shape of the sample in
`examples/report-studio/samples/<type>.yaml`. **Copy values, never invent them**: a score, date, amount or name that is
not in the sources stays out, and you tell the user what is missing. Supporting files go in with `--source`.

## 3 · Build and check

```bash
{{FLOW_TOWER_CLI}} report <type> input.yaml [--source more.csv] --html report.html --out report.pdf
```

The build stops on contradictory input (a severity outside its CVSS band, timestamps out of order): fix the input with
the user, never the check. Any failed check prints and writes no file.

## 4 · Prose (optional)

Only if the user wants it and agrees which sources a model may read. Write `drafts.json`:
`[{ "section": "summary", "text": "…", "cites": ["S1"] }]`. No digits in drafted text (the check rejects them: numbers
come from the data); every paragraph cites the sources it rests on; one or two paragraphs, not a rewrite of the data.
Re-run with `--drafts drafts.json`. Drafted text is marked DRAFTED in the PDF.

## 5 · Look at the pages

```bash
pdftoppm -r 60 -png report.pdf pages/p
```

Open every page and go through [review.md](../../examples/report-studio/review.md). Fix the input or drafts and
render again; a layout problem in the engine is a bug to report (or fix) in Flow Tower, not something to hide.

## 6 · Deliver

Give the user the PDF path and a short list: what the report contains, what was left out because the sources lacked
it, and which paragraphs are drafted. The user signs it off; a report goes out under a person's name.

For a tower: `{{FLOW_TOWER_CLI}} report tower-documentation <tower or folder> --level 1|2|3 --out tower.pdf` (3D
snapshots: slow without a GPU).

## Never

- Invent a number, a finding, a date or a name.
- Put digits in drafted prose, or drafted prose where the user did not ask for it.
- Send sources to a model without the user's consent.
- Hand over a PDF whose pages you did not look at.
