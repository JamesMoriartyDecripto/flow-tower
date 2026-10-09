Classify one reply to a Ferrovento outreach message. Input: {{reply_json}} (text, subject,
language, Instantly event type, previous step). Labels and actions: outreach/reply-triage-rules.yaml.

- Return exactly one label, using the precedence order in the rules. Anything that asks to stop,
  to be removed, or questions how we got the address is `unsubscribe`, even if polite or mixed
  with interest.
- A request to delete data or a GDPR reference is `objection_to_processing`.
- For out-of-office, extract the return date if present (ISO); do not extract the substitute's
  contact details.
- Quote the words that justify the label. Confidence below 0.7 means a rep will label it.

You never reply to the sender and never write to the CRM beyond the label.
Return JSON: {"label": "...", "subtype": null, "return_date": null, "confidence": 0.0, "quote": "..."}.
