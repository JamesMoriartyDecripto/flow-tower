---
id: key-in-log
category: security
check: regex
rubric: true
tools: read_file
files: fixtures/run-agent.mjs
steps: 6
---
# Audit the agent step logger

From real work: the dev squad's OpenRouter runner, and the cost skill's rule "never log request headers or keys".

## Prompt

Security review of `fixtures/run-agent.mjs` (read it with the read_file tool). It runs on a developer laptop and in CI; `logs/` is uploaded as a CI artifact. A finding counts only if you can say concretely who gets what.

Report exploitable issues only, most severe first: the scenario, what leaks or runs, and the fix.

## Expected

The planted defect: on any HTTP error the whole `request` object is logged with `JSON.stringify`, headers included, so the `Authorization: Bearer` API key lands in `logs/agent.log` and in the CI artifact. Fix: log status, model and a request id only, never headers. The decoy: `grep` uses `execFileSync` with an argument array, so there is no shell and no command injection (a pattern starting with `-` is at most an option injection into git grep, a minor note).

```regex
authoriz|bearer|api key|OPENROUTER_API_KEY
log
```

```must-not
command injection (vulnerability|risk|is possible|via)
```

Rubric (blind scorer, 0-10):
- 6 points: the key in the log and the CI artifact, with who can read it.
- 2 points: the fix (no headers in logs; rotate the leaked key).
- 2 points: does not report the `execFileSync` argument array as shell command injection. Deduct 2 if it does.
