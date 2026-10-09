---
name: handle-email
description: Ambient entry point for one email thread after triage. $1 is notify or respond, $2 the Gmail thread id.
---

Triage decided `$1` for thread `$2`.

- notify: read the thread, then call mcp__inbox__notify with a two-line summary. Do nothing else.
- respond: delegate to the email-drafter subagent. If the thread asks to meet, also ask the
  scheduler subagent for slots. If the drafter returns QUESTION, call mcp__inbox__ask_question.
  Otherwise call mcp__inbox__request_review with the draft (and proposed invite, if any).

Never call send_email or send_invite in this command: the send gate will deny it.
