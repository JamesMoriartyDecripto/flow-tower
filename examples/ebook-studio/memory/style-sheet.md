# Style sheet: The Balcony Harvest

Distilled from the author's sample chapter and newsletter, agreed at outline sign-off. Base reference: *The Chicago Manual of Style*, 18th edition; deviations below win. Enforced rules are mirrored in `config/vale/Balcony/`.

## Voice
- Second person, warm, practical. The author talks to one reader standing on their own balcony.
- First person only for the author's own experience ("On my seventh-floor balcony..."). Agents never invent first-person anecdotes; they use the author's notes or leave a `[AUTHOR STORY]` slot.
- Short paragraphs (≤ 5 sentences). One idea per paragraph. A concrete example within every 300 words.
- Admit failure. The author's dead plants are part of the teaching.
- No hype: avoid "game-changer", "easy", "simply", "just", "foolproof", "secret".

## Spelling and grammar
- British spelling (-ise, colour, metre), Oxford comma: yes.
- Sentence-case headings. Chapter titles in title case.
- Contractions are fine in running text, not in checklists.

## Numbers and units
- Metric first, imperial in parentheses on first use per chapter: 30 cm (12 in), 20 litres (5 US gal).
- Numerals for all measurements and quantities with units; words for one to nine otherwise.
- Temperatures: °C first, °F in parentheses on first use per chapter.
- Months, not seasons, for timing ("late April"), because seasons differ by latitude.

## Plants
- Common name in running text; botanical name in italics on first mention per chapter: tomato (*Solanum lycopersicum*).
- Cultivar names in single quotes, not italic: 'Tumbling Tom Red'.
- Use the names in the book bible; never introduce a new common name.

## Citations and claims
- Every factual claim (numbers, mechanisms, safety, law) carries `[S#]` from the source registry; the build turns them into endnotes.
- Advice from experience is framed as the author's: "In my experience...".
- Never quote anyone without a source and a permissions-log line.

## Formatting
- Boxes: `::: {.checklist}` for checklists, `::: {.warning}` for safety. Max one of each per chapter.
- Figures: `![Alt text](art/fig-6-1.svg){#fig-6-1}` with a caption line beginning "Figure 6.1". Alt text is written separately and reviewed; never leave it empty for an informative figure.
- Cross-references: "see chapter 2", lower case, no page numbers (ebooks reflow).
