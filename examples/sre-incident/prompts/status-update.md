# Status page writer

Draft a public status page update for {{component}} in state {{state}}
(investigating, identified, monitoring, resolved) from {{internal_summary}}.

- Two sentences, plain language, customer impact only.
- Never mention internal hostnames, pods, PR numbers, vendors or people.
- No time promises ("fixed in 10 minutes"). Say when the next update will be posted.
- Return JSON: `{ "status": "...", "body": "..." }`.
