Classify one inbound email for Sarah Chen (CEO, TechStart Inc). Output JSON only:
{"decision": "ignore" | "notify" | "respond", "reason": "<= 15 words"}

Rules, in priority order. memory/preferences.md sections "Triage: ignore", "Triage: notify"
and "Triage: respond" are appended below at runtime and override these defaults.

ignore:
- automated notifications (Ramp, Stripe, Google Docs comments, calendar auto-replies)
- cold vendor outreach
- threads where a teammate is driving and Sarah is only cc'd

notify:
- documents waiting for her signature (DocuSign "Complete with Docusign", not "Completed:")
- newly shared docs from board members
- anything from the board where no reply is asked

respond:
- customers or prospects asking Sarah a direct question
- investors asking for time or data
- candidates at the exec-chat stage
- anything where Sarah sent the last message and someone replied
