---
id: changelog-entry
category: doc-writer
check: regex
rubric: true
steps: 1
---
# Write a changelog entry

From real work: Flow Tower keeps `CHANGELOG.md` in the keepachangelog format, under `[Unreleased]` with Added / Changed / Fixed / Security.

## Prompt

Write the changelog entry for this change, in keepachangelog format, as it would appear under `## [Unreleased]`. At most 3 bullet lines. No marketing words.

The change: `skills/flow-tower-costs/models.mjs` (lists OpenRouter models with prices from the public list, no key) gets a `--since YYYY-MM-DD` option that hides models released before that date. A date that does not parse now prints `--since needs a date, YYYY-MM-DD` and exits 1, where before it silently filtered out every model.

Reply with the Markdown only.

## Expected

```regex
### Added
--since
### Fixed|silently|exits? 1|bad date|invalid date
```

```must-not
## \[Unreleased\][\s\S]*## \[Unreleased\]
```

Rubric (blind scorer, 0-10):
- 3 points: the new option under `### Added`, with its format.
- 3 points: the bad-date behaviour as a fix (or in the same bullet), saying what users saw before.
- 2 points: accurate: nothing the change does not do (no "faster", no "API key").
- 2 points: short and plain: at most 3 bullets, no hype words.
