---
id: coder-a
category: coder
check: rubric
steps: 5
---
# Coder: reject non-finite numbers in formatPrice

Synthetic pilot coder task for case A. Acceptance is judged from the repository files; the offline check is separate.

## Prompt

You are the coder role of the dev squad. The case directory is the repository root.

Change `src/price.mjs` so that `formatPrice(value)`:

- returns `value.toFixed(2)` for a finite number (so `12.5` gives `"12.50"` and `3.14159` gives `"3.14"`);
- throws a `TypeError` for `NaN`, `Infinity`, `-Infinity` and for any string, including `"12.5"`.

Only `src/` may be written. Do not edit `tests/` or `docs/`. Keep the module a plain ES module with no dependencies.

Edit the file with your edit tools, run the project check (command `check`, which is `node --test`) with the run tool, and fix any failure it shows. Then call finish with a short report: the files you changed and the result of the check.

## Expected

Rubric, judged from the repository files after the run:

- `formatPrice` still returns `value.toFixed(2)` for finite numbers.
- `NaN`, `Infinity`, `-Infinity` and strings throw a `TypeError`.
- Only `src/price.mjs` changed; no test or doc file was edited.
- The report names the files changed and states the check result honestly.

The offline acceptance check (`checks/price.check.mjs`) is run by the harness separately. It is not part of this rubric and the candidate never sees it.
