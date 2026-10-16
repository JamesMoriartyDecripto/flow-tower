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
When adding or modifying routes, keep `/api/events` returning `204 No Content` with an empty body on success. Claude Code HTTP hooks post to this route and parse the response body: if it is JSON, Claude Code treats it as the hook's decision, such as allowing or blocking a tool call. Returning something like `{"ok":true}` "for debugging" was once tried and risks altering hook behavior. For debugging, use server logs instead, and never add a JSON body to this route's success response.
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
```markdown
### Added
- `skills/flow-tower-costs/models.mjs`: `--since YYYY-MM-DD` option hides models released before the given date.

### Fixed
- `skills/flow-tower-costs/models.mjs`: a `--since` value that is not a valid date now prints `--since needs a date, YYYY-MM-DD` and exits 1. Before, it silently filtered out every model.
```
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
```markdown
### Added
- `skills/flow-tower-costs/models.mjs`: `--since YYYY-MM-DD` option hides models released before the given date.

### Fixed
- `skills/flow-tower-costs/models.mjs`: an unparseable `--since` date now prints `--since needs a date, YYYY-MM-DD` and exits 1. Before, it silently filtered out every model.
```
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
When adding or modifying routes, keep `/api/events` returning `204 No Content` with an empty body on success. This route receives live events, including Claude Code HTTP hooks, and Claude Code parses any JSON response body as the hook's decision, such as allowing or blocking a tool call. A body like `{"ok":true}`, once added "for debugging," can therefore be misread as a decision and alter Claude Code's behavior. Log server-side if you need visibility, and do not add a response body.
````

## B005 · doc-writer/changelog-entry: Write a changelog entry

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
The `/api/events` route must keep responding with `204 No Content` and an empty body. It receives live events, including Claude Code HTTP hooks, and Claude Code treats any JSON response body from a hook as that hook's decision, such as allowing or blocking a tool call. An earlier change to return `{"ok":true}` for debugging injected unintended decisions into hook processing. If you need to debug, log the response server-side or use a separate route rather than changing this response body.
````

## B007 · doc-writer/changelog-entry: Write a changelog entry

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
```markdown
### Added
- `skills/flow-tower-costs/models.mjs`: new `--since YYYY-MM-DD` option hides models released before the given date.

### Fixed
- `skills/flow-tower-costs/models.mjs`: an unparseable `--since` date now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
```
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
The `/api/events` route must keep answering `204 No Content` with an empty body. It receives live events, including Claude Code HTTP hooks, and Claude Code treats any JSON response body from a hook as a decision that can allow or block a tool call. Returning `{"ok":true}`, as someone did once for debugging, changes that behavior and can silently alter how Claude Code runs. For debugging, log the response on the server side instead of changing what the route returns.
````

## B009 · doc-writer/changelog-entry: Write a changelog entry

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
- `skills/flow-tower-costs/models.mjs`: new `--since YYYY-MM-DD` option hides models released before the given date.

### Fixed
- `skills/flow-tower-costs/models.mjs`: an unparseable `--since` date now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
````

## B010 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

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
The `/api/events` route must answer successful requests with `204 No Content` and an empty body. Claude Code HTTP hooks post live events here, and Claude Code reads the hook's HTTP response. Any JSON body is treated as the hook's decision, such as allowing or blocking a tool call. A harmless-looking `{"ok":true}` added "for debugging" can therefore change Claude Code's behavior. Keep the response bodiless, and debug through server logs instead.
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
The `/api/events` route must answer successful requests with `204 No Content` and an empty body. Claude Code HTTP hooks post live events here, and Claude Code reads the hook's HTTP response. Any JSON body is treated as the hook's decision, such as allowing or blocking a tool call. Returning something harmless-looking like `{"ok":true}` "for debugging" can therefore change Claude Code's behavior. If you need debugging output, log it on the server instead of in the response.
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
```markdown
### Added
- `skills/flow-tower-costs/models.mjs`: `--since YYYY-MM-DD` option hides models released before the given date.

### Fixed
- `skills/flow-tower-costs/models.mjs`: an unparseable `--since` date now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
```
````

## B014 · doc-writer/changelog-entry: Write a changelog entry

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
```markdown
### Added
- `skills/flow-tower-costs/models.mjs`: new `--since YYYY-MM-DD` option that hides models released before the given date.

### Fixed
- `skills/flow-tower-costs/models.mjs`: an unparseable `--since` date now prints `--since needs a date, YYYY-MM-DD` and exits 1, instead of silently filtering out every model.
```
````

## B015 · doc-writer/changelog-entry: Write a changelog entry

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

## B016 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

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
The `/api/events` route must answer `204 No Content` with an empty body on success. Do not add a JSON body, not even `{"ok":true}` for debugging. This route receives Claude Code HTTP hooks, and Claude Code reads the hook's response. If the body is JSON, it treats it as the hook's decision, which can allow or block a tool call. For debugging, log on the server side and keep the response unchanged.
````

## B017 · doc-writer/hook-gotcha: Explain the events endpoint gotcha

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
The `/api/events` route must keep responding with `204 No Content` and an empty body. It receives live events, including Claude Code HTTP hooks, and Claude Code treats any JSON response body from a hook as a decision that can allow or block a tool call. An earlier change returning `{"ok":true}` for debugging was exactly this mistake, because it silently injected a hook decision. If you need to debug, log the response on the server side or use a separate route, not a body on this one.
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
When adding or modifying routes, note that `/api/events` must return `204 No Content` with an empty body on success. Claude Code HTTP hooks post to this route and read the response: a JSON body is interpreted as the hook's decision, such as allowing or blocking a tool call. Returning something like `{"ok":true}` "for debugging" once caused exactly this problem. Log server-side instead, and never add a JSON body to this route's success response.
````
