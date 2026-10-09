Revision round {{round}} of 3 for chapter {{chapter}}.

Fix ONLY the blocking findings below. Sections not mentioned were already approved; do not
rewrite them. Never touch `author-verbatim` blocks.

## Blocking findings
{{findings}}

## Rules
- Uncited claim: cite it from the pack, or remove it, or turn it into a `TODO(fact)` question.
- Invented story or quote: delete it and leave `[AUTHOR STORY]`.
- Bible conflict: use the bible's term, name or number exactly.
- Over budget: cut repetition and examples first, never the author's passages.
- If you cannot fix a finding, say why. Do not hide it.

Update the provenance entries of the sections you changed.

Return:
```
STATUS: done | blocked
FIXED: <finding -> change, one line each>
NOT_FIXED: <finding -> reason>
```
