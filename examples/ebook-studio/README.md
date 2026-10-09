# Ebook Studio

A small press's pipeline from book proposal to a launched, accessible ebook sold wide. Agents do the research, drafting from the author's notes, editing passes, fact-checks and production. People decide at every gate: the author approves the outline and rewrites every chapter, the managing editor signs off quality, the publisher says go. Sample book: *The Balcony Harvest* (fictional), a 12-chapter practical gardening guide by Ines Halvorsen for Larchwood Press.

How it differs from `course-studio`: this is **book publishing** (EPUB/print, ISBN, store metadata, KDP/Apple/Kobo/Google/D2D, AI disclosure, pre-orders, ARC readers). It does not cover lessons, quizzes or an LMS.

```bash
node bin/flow-tower.js examples/ebook-studio
```

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Market & Concept | Email proposal → Haiku intake → Opus publishing lead; comp analysts (fan-out 5-8) and keyword/shelf research → positioning brief → **greenlight** (publisher + author, max 2 rounds). |
| 2 | Outline & Style | Outliner writes the chapter plan, **style sheet** (Vale rules) and **book bible**; librarian fan-out per chapter fills the **source registry** → **outline sign-off** by the author. |
| 3 | Drafting | Dispatcher (concurrency 4) → **chapter writer ×12** (sub-tower) with the style lint hook → **provenance ledger** → **author rewrite** of every chapter → assembled manuscript. |
| 4 | Editing & Fact-check | Developmental edit ⇄ author response (max 2) → line edit → copyedit → fact-check per chapter, Copyleaks originality scan (HTTP + webhook), rights & permissions guard → **editor sign-off** (max 3 fix rounds). |
| 5 | Design & Production | Human cover designer (AI mood boards only), SVG diagrams, alt-text fan-out, front/back matter → Pandoc build (EPUB 3 + Typst print PDF) → **EPUBCheck** and **Ace** guards, Kindle Previewer → **proof approval**. |
| 6 | Publishing & Metadata | ISBN → store metadata → **AI disclosure guard** (reads the ledger) → **publisher go** → KDP, Apple Books, Kobo, Google Play, Draft2Digital (manual uploads, KDP final file ≥ 72h before release). |
| 7 | Launch & Analytics | Book site with a **cover A/B**, author newsletter, ARC readers (no rating conditions), weekly sales analyst, update-or-new-edition decision, **AI audiobook** (`status: planned`). |

**Sub-tower** `towers/chapter.tower.yaml` (one per chapter): inputs (brief, author notes, bible + style sheet, source pack) → plan → draft under the Vale hook → fresh-context self-review and a Haiku continuity check against the bible (bible change requests go to the author) → gate with `max_iterations: 3` → revise, hand off to the author, or escalate to the lead.

## Operational features used

- `trigger`: email (proposal), file (weekly report exports).
- `approval` on greenlight, outline, author rewrite (`on_timeout: wait`), author response, editor, cover, proofs and publisher go (`on_timeout: reject`), with `limits.max_iterations` for the rounds.
- `fanout`: comps, librarian, writers, line editor and fact-checker per chapter, alt text per figure, ARC readers.
- `limits`: timeouts, retries, `concurrency: 4` for writers, loop bounds.
- `budget`: $140 per book on the lead, per-chapter caps on writers and fact-checkers.
- `data`: manuscript `confidential`, newsletter `pii` (EU, 730d), sales `internal`.
- `credentials`: `service` (press store accounts, Copyleaks), `author` (newsletter).
- `sandbox`: writers have `network: none`, so no facts arrive without a source id.
- `evals` (illustrative): Vale errors per 1k words, word budget, continuity conflicts, fact-check first-pass rate, misattributions = 0, similarity %, alt-text coverage, EPUBCheck errors/warnings = 0 and Ace serious/critical = 0 (`higher_is_better: false`), cover CTR uplift, pre-orders.
- `sla`: author rewrite 42d, KDP final file 72h, ARC window 21d. `version` + `rollout: ab` for the cover test. Edge `protocol`: mcp, http, webhook.

## Files

`prompts/` (16 agent prompts) · `memory/` style sheet, book bible, provenance ledger · `samples/` brief, outline, chapter 6 excerpt, source registry, store listing · `build/` Pandoc defaults, EPUB metadata with accessibility properties, CSS, front/back matter · `scripts/build-ebook.sh` (Pandoc → conformance metadata → EPUBCheck → Ace → print PDF) · `hooks/disclosure-guard.ts` · `checklists/` AI disclosure, permissions log, launch · `config/vale*` · `logs/` drafting, build and launch.

## Sources (opened 2026-10-09)

- KDP content guidelines, AI content: https://kdp.amazon.com/en_US/help/topic/G200672390
- KDP pre-orders (72h final file, 18-month window from 2 Sep 2026): https://kdp.amazon.com/en_US/help/topic/G201499380
- KDP formats, cover, keywords, categories, ISBN: https://kdp.amazon.com/en_US/help/topic/G200634390 · https://kdp.amazon.com/en_US/help/topic/G6GTK3T3NUHKLEFX · https://kdp.amazon.com/en_US/help/topic/G201298500 · https://kdp.amazon.com/en_US/help/topic/G200652170 · https://kdp.amazon.com/en_US/help/topic/G201834170 · Kindle Previewer: https://kdp.amazon.com/en_US/help/topic/G202131170
- KDP daily title cap (2023): https://authorsguild.org/news/amazon-adds-to-kdp-generative-ai-policy-caps-daily-self-publishing-uploads/
- Virtual Voice eligibility: https://kdp.amazon.com/en_US/help/topic/GJSXT4GZLP4PL62B · Google Play auto-narration: https://support.google.com/books/partner/answer/10013009
- Apple Books guidelines 1.13: https://help.apple.com/itc/applebooksstoreformatting/en.lproj/static.html · Draft2Digital: https://draft2digital.com/content-guidelines/
- EPUB Accessibility 1.1: https://www.w3.org/TR/epub-a11y-11/ · EAA mapping: https://www.w3.org/TR/epub-a11y-eaa-mapping/
- EPUBCheck releases (5.4.0, 2026-09-15): https://github.com/w3c/epubcheck/releases · Ace by DAISY (1.4.6): https://daisy.github.io/ace/docs/cli/
- Pandoc EPUB and manual (3.12.1): https://pandoc.org/epub.html · https://pandoc.org/MANUAL.html
- EU AI Act Article 50: https://artificialintelligenceact.eu/article/50/ · US Copyright Office AI reports: https://www.copyright.gov/ai/ · Authors Guild Human Authored FAQ: https://authorsguild.org/human-authored/faq/
- BISAC gardening headings (2025): https://www.bisg.org/gardening · Copyleaks API docs: https://docs.copyleaks.com/

Kobo's AI rule is cited from a dated third-party summary (https://www.inkfluenceai.com/learn/can-you-sell-ai-generated-books); Kobo's help page returned 403.

The book, author, press, people, ISBNs, prices, URLs ending in `.example` and all run numbers are fictional. Evals, budgets and sales figures are illustrative. Store rules change: re-open them before each upload.
