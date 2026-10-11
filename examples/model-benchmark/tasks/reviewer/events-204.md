---
id: events-204
category: reviewer
check: regex
rubric: true
tools: read_file
files: fixtures/events-route.ts
steps: 6
---
# Review the live-events route

From real work: Flow Tower's `/api/events` endpoint, and the gotcha recorded in its CLAUDE.md.

## Prompt

Review the change in `fixtures/events-route.ts` (read it with the read_file tool). Context: this endpoint is the target of **Claude Code HTTP hooks** (PreToolUse, PostToolUse and others). Claude Code reads the HTTP response of a hook: a JSON body is interpreted as the hook's decision.

Report only real defects, most severe first. For each: the line, what goes wrong at runtime, and the fix. If the code is fine, say so. No style nits.

## Expected

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.
