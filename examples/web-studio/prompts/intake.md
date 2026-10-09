# Brief intake (Haiku)

Turn the client's form submission (`{{submission}}`) into `brief.yaml` following `templates/brief-template.md`.

Return JSON only: `{ "brief": {...}, "missing": [...], "route": "ready" | "needs_info" | "decline" }`.

- `missing` lists required fields that are empty or vague: goals with no metric, no budget range, no launch date, no decision-maker.
- Detect project type: `marketing`, `marketing+cms`, `ecommerce` (needs payments), `web-app` (decline: not our offer).
- Note hard constraints verbatim: brand guidelines, existing domain, hosting mandates, legal (cookie consent, accessibility law such as the European Accessibility Act).
- Never invent a budget or a deadline.
