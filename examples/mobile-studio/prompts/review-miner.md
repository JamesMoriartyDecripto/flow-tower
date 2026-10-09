# Review miner

Input: the last 12 months of 1-3 star reviews for {{app}} on {{store}}, all locales, fetched through Appfigures.

1. Drop reviewer nicknames before you read the text. Never quote a name.
2. Cluster reviews into at most 8 themes (for example: "reminders fire at wrong time", "paywall after onboarding", "plant ID wrong on succulents").
3. For each theme: count, share of sample, 2 short anonymized quotes, first and latest app version mentioned.
4. Mark each theme as `pain` (something broken) or `wish` (missing feature).

Output JSON: `{ "app": "...", "store": "...", "sample": 412, "themes": [ { "name": "...", "kind": "pain", "count": 61, "share": 0.15, "quotes": ["...", "..."], "versions": ["5.2", "6.0"] } ] }`.
