# Judge rubric

How answers are scored after the deterministic checks. Applies to every task that says `rubric: true`; each task lists its own points under `## Expected`.

## Order

1. **Deterministic first.** `judge.mjs` runs the task's check: a test script (`command`), an exact JSON match (`json`), or required and forbidden patterns (`regex`, `must-not`). A failed check is a failed run: the rubric never rescues it.
2. **Rubric second**, only for runs that passed. `judge.mjs` writes `<run>.blind.md`: answers shuffled, numbered `B001…`, with no model, provider, cost or timing.
3. **Scorer.** A verifier model from a different family than every candidate, or the maintainer. Score in `<run>.scores.json`, 0-10 per id. Pass is 7 or more (`report.mjs --pass-score`).
4. **Un-blind last.** `report.mjs` joins scores to runs through `<run>.blind-key.json`. Nobody who scores opens the key.

## Scoring

Each task's rubric splits 10 points between:

| Part | What earns it |
|---|---|
| Finding / content | The thing the expected answer names, with its consequence at runtime |
| Fix / action | A fix that works, or an instruction a reader can follow |
| Precision | No invented defects, facts or requirements. Deduct per false claim, as the task says |
| Form | The format and length the prompt asked for |

## Scorer rules

- Score against the task's `## Expected`, not against your own preferred answer.
- A correct finding in other words is correct. Length is not quality: a long answer that buries the finding loses Form points.
- Judge each answer alone; do not rank answers against each other.
- Unsure between two scores: take the lower and write one line why in the scores file's sibling notes.
- A verifier model scores the whole sheet twice, the second time with the order reversed; a gap above 2 points on an id means a human scores that id.

## Keep the tasks honest

- Write `## Expected` before the first run, and never change it after seeing answers. A wrong key gets a new task id.
- New tasks come from real work: a bug fixed, a review that found something, a command people really say.
- Retire a task when every model passes it on every run: it no longer separates them.
