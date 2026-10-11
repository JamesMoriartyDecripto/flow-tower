---
id: hook-gotcha
category: doc-writer
check: regex
rubric: true
steps: 1
---
# Explain the events endpoint gotcha

From real work: a Flow Tower gotcha, "`/api/events` must answer 204 with an empty body: Claude Code HTTP hooks read a JSON body as a hook decision" (CLAUDE.md, docs/realtime.md).

## Prompt

Write one paragraph (at most 80 words) for the developer docs of a local dev server, for someone adding a new route.

Facts:
- The server's `/api/events` route receives live events, including from Claude Code HTTP hooks.
- Claude Code reads the HTTP response of a hook; if the body is JSON, it treats it as the hook's decision (for example allowing or blocking a tool call).
- So the route answers `204 No Content` with an empty body, on success.
- Someone once changed it to return `{"ok":true}` "for debugging".

Say what to do, and why, so the next person does not change it back. Reply with the paragraph only.

## Expected

```regex
204
empty|no body|without a body
decision
```

Rubric (blind scorer, 0-10):
- 4 points: the rule (204, empty body) and the reason (a JSON body is read as a hook decision).
- 2 points: the consequence of breaking it (tool calls allowed or blocked by accident).
- 2 points: at most 80 words, plain, no filler.
- 2 points: nothing invented (no other status codes or headers presented as required).
