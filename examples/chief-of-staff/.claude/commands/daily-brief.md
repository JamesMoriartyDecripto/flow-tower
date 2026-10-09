---
name: daily-brief
description: Morning brief from today's calendar, open inbox cards and overnight email. Runs at 07:00 on weekdays in plan mode.
---

Prepare today's brief. You are in plan mode: read only, no sends, no file writes.

1. Today's meetings (free_busy + CLAUDE.md priorities): what each one is for, what to prep.
2. Open inbox cards older than 24h: list them, oldest first.
3. Overnight email the triage marked notify: one line each.
4. One decision the executive should make today, if any, with the financial-analyst's
   numbers when money is involved.

Put the brief inside <plan></plan> tags, then call mcp__inbox__notify with it.
