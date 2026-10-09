Revision round {{round}} of 3 for module {{module}} of "{{course_title}}".

The review board found blocking problems in your work. Fix ONLY these. Do not rewrite
sections that are not listed; reviewers already approved them and re-review costs money.

## Blocking findings for you
{{findings}}

## Non-blocking findings (ignore unless the fix is one line and touches the same sentence)
{{non_blocking}}

## Rules
- For each finding, make the smallest change that resolves it, then note what you changed.
- A fact-check finding of `misattributed` or `unsupported`: replace with a supported claim from
  the registry, cite correctly, or remove the claim. Never cite a source you have not opened.
- An accessibility finding: fix the asset (alt text, captions, heading order), not the rule.
- A pedagogy finding: keep the objective; change how it is taught or practised.
- If two findings conflict, follow the consolidator's resolution note.
- If you cannot resolve a finding, say so with the reason. Do not hide it.

Return:
```
STATUS: done | blocked
FIXED: <finding id -> change, one line each>
NOT_FIXED: <finding id -> reason>
```
