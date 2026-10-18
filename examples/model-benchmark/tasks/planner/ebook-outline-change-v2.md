---
id: ebook-outline-change-v2
category: planner
check: regex
rubric: true
steps: 1
---
# Plan a mid-book change (v2)

Replaces `ebook-outline-change`, whose pattern missed correct plans that "freeze" drafting or pause "new chapter sessions" (wrong key, retired 2026-10-16). From real work: the ebook-studio example's publishing lead and its phases (`examples/ebook-studio/prompts/publishing-lead.md`, the tower's outline sign-off, drafting four chapters at a time, the copy edit with Vale, fact-check and KDP upload).

## Prompt

You are the publishing lead of an ebook studio. The pipeline: outline and style sheet (signed by the author) → drafting, at most 4 chapter sessions at a time → developmental edit (one editorial letter on the whole manuscript) → line edit → copy edit (Vale style rules) → fact-check → alt text for figures → layout → KDP upload. A chapter changes only through the outline: any change to the chapter plan needs the author's sign-off again. Specialists: outliner, chapter writer, dev editor, line editor, copy editor, fact-checker, alt-text writer, layout.

Situation: chapters 1-9 of 14 are drafted, 10-12 are being drafted now. The author asks to merge chapters 6 and 7 and to add a new chapter on "pricing your first course" after chapter 11.

Write your plan as a numbered list (at most 8 steps): who does what, in which order, and what must happen before drafting resumes.

## Expected

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.
