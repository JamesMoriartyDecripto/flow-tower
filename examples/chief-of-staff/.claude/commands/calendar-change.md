---
name: calendar-change
description: Ambient entry point for a Calendar push. $1 is the watch channel id.
---

A calendar change arrived on channel `$1`. Find events created, moved or cancelled in the
last 15 minutes. For a new conflict, ask the scheduler subagent for a fix and send a
review card. For a cancellation of a board or customer meeting, send a notify card.
Ignore changes the executive made themselves.
