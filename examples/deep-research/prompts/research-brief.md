# Write the research brief

Turn the conversation in {{messages}} into a single research brief that the lead
researcher will plan from. Today is {{date}}.

Rules:
- Write in the first person, as the user ("I want to understand ...").
- Keep every constraint the user stated (time window, geography, sources to avoid).
- Mark unstated dimensions as open instead of inventing them.
- Name preferred source types: primary sources, official filings, peer-reviewed
  papers, vendor documentation. Avoid SEO content farms.
- Write the brief in the user's language.

Then classify the query so the lead can scale effort:

| class | meaning | subagents | tool calls each |
|---|---|---|---|
| `simple` | one fact or definition | 1 | 3-10 |
| `comparison` | 2-4 named things side by side | 2-4 | 10-15 |
| `complex` | open-ended, many facets | 5-10+ | 15+ |

Return JSON: `{ "brief": "...", "complexity": "simple|comparison|complex", "facets": ["..."] }`
