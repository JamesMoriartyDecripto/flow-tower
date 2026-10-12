# Blind rubric sheet

Score each answer 0-10 against its task rubric and rubric.md. You do not know which model wrote it; do not try to guess.

## B001 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding or changing `/api/events`, keep successful responses as `204 No Content` with an empty body. The route receives live events, including Claude Code HTTP hooks, and Claude Code interprets a hook’s JSON response body as its decision—for example, whether to allow or block a tool call. Returning `{"ok":true}` for debugging could therefore be treated as a decision, not an acknowledgement; use logs or other diagnostics instead.
````

## B002 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
### Added
- Add a `--since YYYY-MM-DD` option to filter out OpenRouter models released before a date.
- Print `--since needs a date, YYYY-MM-DD` and exit 1 when the date is invalid.
````

## B003 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
### Unreleased

### Added
- `flow-tower-costs` `models.mjs`: `--since YYYY-MM-DD` option hides models released before the given date.

### Fixed
- `flow-tower-costs` `models.mjs`: an unparseable `--since` value now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
````

## B004 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding or modifying `/api/events`, return `204 No Content` with an empty body on success. This route receives live events, including Claude Code HTTP hooks, which interpret a JSON response body as the hook’s decision—for example, whether to allow or block a tool call. Do not return `{"ok":true}` or other JSON “for debugging”: even a harmless-looking acknowledgment could change Claude Code’s behavior.
````

## B005 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding routes that serve as Claude Code HTTP hooks, return `204 No Content` with an empty body on success. The Claude client interprets any JSON response body as a hook decision (e.g., allow/block a tool). A `204` with no body signals success without triggering any action, preventing unintended side effects. Never return `{"ok":true}` or similar; that was mistakenly added for debugging but misled the hook. Always use `204`.
````

## B006 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding new routes to the local dev server, ensure endpoints interacting with Claude Code HTTP hooks adhere strictly to expected response contracts. Specifically, `/api/events` must return a `204 No Content` status with an empty body on success. Claude Code parses hook responses as JSON to determine automated decisions like blocking or allowing tool calls; returning extraneous debugging payloads like `{"ok":true}` will break this integration and disrupt hook execution.
````

## B007 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding routes, leave `/api/events` returning `204 No Content` with an empty body. It receives live events, including Claude Code HTTP hooks, and Claude Code reads the hook's HTTP response: a JSON body becomes the hook's decision, silently allowing or blocking tool calls. Returning `{"ok":true}` to debug would therefore change behavior; log elsewhere instead.
````

## B008 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding a route, note that `/api/events` must keep returning `204 No Content` with an empty body. Claude Code reads the hook's HTTP response body, and any JSON is interpreted as the hook's decision (for example allowing or blocking a tool call). Returning `{"ok":true}` "for debugging" would be read as a malformed decision, so never change it; log to the server console instead.
````

## B009 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
For `/api/events`, always return `204 No Content` with an empty body on success. Claude Code HTTP hooks treat any JSON response as a hook decision (e.g., allow or block). Including a body like `{"ok":true}` is misinterpreted and can unintentionally block tool calls. The previous debug change caused this problem—do not add JSON responses, or the hook integration will break.
````

## B010 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
### Unreleased

### Added
- `flow-tower-costs` `models.mjs`: `--since YYYY-MM-DD` option to hide models released before the given date.

### Fixed
- `flow-tower-costs` `models.mjs`: an unparseable `--since` value now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
````

## B011 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
### Unreleased

### Added
- `flow-tower-costs` `models.mjs`: `--since YYYY-MM-DD` option to hide models released before the given date.

### Fixed
- `flow-tower-costs` `models.mjs`: an unparseable `--since` value now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
````

## B012 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When implementing routes that handle Claude Code hooks, always return `204 No Content` with an empty body. Claude Code parses any JSON in the response as a direct tool-call decision (e.g., allow or block). Including debugging payloads like `{"ok":true}` causes Claude to misinterpret the data as a command decision, breaking your workflow. Strictly maintain empty responses to ensure reliable execution.
````

## B013 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
## [Unreleased]

### Added
- `--since YYYY-MM-DD` option for `skills/flow-tower-costs/models.mjs` to hide models released before the given date.

### Fixed
- `--since` with an unparseable date now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
````

## B014 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding routes, keep `/api/events` returning `204 No Content` with an empty body on success. Claude Code HTTP hooks parse any JSON response as a hook decision, so `{"ok":true}` would be misread as allowing or blocking a tool call. Do not "improve" it for debugging; log elsewhere or use headers. This preserves hook correctness.
````

## B015 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
The `/api/events` route handles live events, including Claude Code HTTP hooks. Claude Code interprets JSON response bodies as hook decisions (e.g., allowing or blocking tool calls). Therefore, always return `204 No Content` with an empty body on success. Returning JSON like `{"ok":true}` causes Claude to misinterpret the response as a decision, breaking workflow automation. Maintain this strict schema to ensure reliable hook behavior.
````

## B016 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
## [Unreleased]
### Added
- Add `--since YYYY-MM-DD` to hide models released before the specified date.
### Fixed
- Show `--since needs a date, YYYY-MM-DD` and exit with status 1 when the date is invalid.
````

## B017 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
## [Unreleased]

### Added
- Add `--since YYYY-MM-DD` option to `skills/flow-tower-costs/models.mjs` to filter models by release date.

### Fixed
- Exit with code 1 and print error on invalid `--since` date instead of silently filtering all models.
````

## B018 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding new routes, always return `204 No Content` with an empty body on success. Previously, returning `{"ok":true}` for debugging was reverted because Claude Code HTTP hooks parse *any* JSON response as a tool-call decision. This misinterprets standard acknowledgments as explicit allows or blocks, breaking event pipelines. Ensure all new endpoints adhere to this strict null-response contract to prevent unintended routing decisions.
````

## B019 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
## [Unreleased]

### Added
- `--since YYYY-MM-DD` option in `skills/flow-tower-costs/models.mjs`; hides models released before that date.

### Fixed
- `--since` with a date that does not parse prints `--since needs a date, YYYY-MM-DD` and exits 1; previously it silently filtered out every model.
````

## B020 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
Do not change `/api/events` to return a JSON body (e.g. `{"ok":true}`) on success; it must always answer `204 No Content` with an empty body. Claude Code consumes this route's responses as hook outputs, and if the body is JSON it interprets it as the hook's decision — allowing or blocking tool calls. Even a harmless-looking body can therefore alter agent behavior. For debugging, log request/response details server-side instead of returning a body.
````

## B021 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
Keep `/api/events` responding with `204 No Content` and an empty body on success. Claude Code treats any JSON in a hook's HTTP response as a decision, such as allowing or blocking a tool call, so a body like `{"ok":true}` can silently change hook behavior. This was once changed "for debugging" and caused exactly that problem. If you need to inspect responses, log them server-side rather than adding a body. Apply the same rule to any new route that receives Claude Code hooks.
````

## B022 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
The `/api/events` route must keep responding with `204 No Content` and an empty body. It receives live events, including Claude Code HTTP hooks, and Claude Code treats any JSON response body from a hook as that hook's decision, such as allowing or blocking a tool call. Returning `{"ok":true}`, which was once added for debugging, therefore changes Claude Code's behavior and can silently alter what it permits. If you need to debug, log the response server-side or use a separate route instead of changing this one's response.
````

## B023 · doc-writer/changelog-entry: Write a changelog entry

### Task rubric

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

### Answer

````text
## [Unreleased]

### Added
- `--since YYYY-MM-DD` option for `skills/flow-tower-costs/models.mjs`, which hides models released before the given date.

### Fixed
- An unparsable `--since` date now prints `--since needs a date, YYYY-MM-DD` and exits 1 instead of silently filtering out every model.
````

## B024 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
`/api/events` must return `204 No Content` with an empty body on success — do not change this, even temporarily for debugging. Claude Code consumes this endpoint via HTTP hooks and parses the response body as JSON; any JSON body is treated as the hook's decision (e.g., allowing or blocking a tool call). A body like `{"ok": true}` can therefore cause unintended hook decisions. If you need to inspect the payload while debugging, log the request server-side instead of altering the response.
````

## B025 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding a new route, ensure the `/api/events` endpoint continues to return `204 No Content` with an empty body on success. This route receives live events, including Claude Code HTTP hooks, which parse JSON response bodies as programmatic decisions (such as blocking or allowing tool calls). Returning JSON like `{"ok":true}`—previously introduced for debugging—breaks this integration by causing Claude Code to misinterpret the debug message as a hook decision.
````

## B026 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding or modifying routes on `/api/events`, note that this endpoint intentionally returns `204 No Content` with an empty body on success. Claude Code consumes this endpoint's responses as HTTP hook decisions: if the body contains JSON, it interprets it as a decision (e.g., allowing or blocking a tool call). Returning any JSON body here—even something innocuous like `{"ok":true}` for debugging—will corrupt that behavior. Keep the response body empty. If you need to inspect the response while debugging, log it server-side instead of changing the response body.
````

## B027 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When modifying the local dev server, ensure `/api/events` returns `204 No Content` with an empty body on success. Claude Code interprets any JSON response body as a hook decision, such as allowing or blocking tool calls. Returning a JSON payload like `{"ok":true}` can inadvertently alter behavior, so avoid adding response bodies even for debugging.
````

## B028 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding a new route, ensure `/api/events` returns `204 No Content` with an empty body on success. This endpoint receives live events, including Claude Code HTTP hooks. Claude Code interprets any JSON response body as a hook decision (e.g., allowing or blocking tool calls). Previously, returning `{"ok":true}` caused unintended behavior. To avoid this, always send an empty body for successful events.
````

## B029 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
Always return a `204 No Content` status with an empty body on success. Claude Code treats any JSON response as a tool-call decision. Returning `{"ok":true}` or other debug payloads will inadvertently block operations by triggering this logic. Never send JSON, even for debugging, to prevent unexpected behavior. Strictly maintain the empty response contract.
````

## B030 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
Keep `/api/events` returning `204 No Content` with an empty body on success. Do not change it to return JSON like `{"ok":true}`, even temporarily for debugging. Claude Code treats any JSON response body from a hook as the hook’s decision, so a debug payload can unintentionally allow or block tool calls. If you need visibility, log or emit metrics instead; never put debug data in the response.
````

## B031 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
The `/api/events` route must keep returning `204 No Content` with an empty body on success. It receives live events, including Claude Code HTTP hooks, and Claude Code treats any JSON response body from a hook as that hook's decision, such as allowing or blocking a tool call. A body like `{"ok":true}`, even added for debugging, can therefore change Claude Code's behavior. Use logging or a debugger to inspect responses instead of altering the body. When adding a new route, keep this in mind for any endpoint that hooks may call.
````

## B032 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding new routes to the local dev server, ensure endpoints interacting with Claude Code HTTP hooks return a `204 No Content` response with an empty body on success, rather than JSON like `{"ok":true}`. Claude Code parses hook responses as JSON to determine tool execution decisions (such as allowing or blocking actions). Returning unexpected JSON bodies will disrupt hook evaluation. Keep responses empty and rely on server logs for debugging.
````

## B033 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

### Task rubric

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

### Answer

````text
When adding or changing `/api/events`, keep successful responses as `204 No Content` with an empty body. The route receives live events, including Claude Code HTTP hooks, and Claude Code interprets a hook’s JSON response body as its decision—for example, whether to allow or block a tool call. Do not return `{"ok":true}` for debugging: even that JSON can be mistaken for a hook decision. Use logs or other diagnostics instead.
````
