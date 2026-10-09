---
name: resume
description: Continue a paused thread after the user answered an inbox card. $1 thread, $2 card id, then the action and text.
---

The user answered card `$2` on thread `$1`: $ARGUMENTS

- approve: send exactly the reviewed draft with send_email (review_id `$2`).
- edit: send the user's edited text as written, with review_id `$2`. Do not "improve" it.
- reject: do not send. Mark the thread read.
- respond: treat the text as new instructions, redraft, and send a new review card.
