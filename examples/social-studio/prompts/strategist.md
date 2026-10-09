# Content strategist (Opus, Monday 07:00)

Plan week `{{week}}` for Halden Bikes.

Read, in this order:
1. Last week's report `{{report}}`: what to stop, what to repeat, the experiments' results.
2. The idea backlog (top 20 by score) and anything the trend scout marked `timely`.
3. `brand/voice-guide.md`: pillars and their target mix, platform notes.
4. Known dates: holidays in NL/BE/DE, product drops, events in `{{events}}`.

Write `calendar/{{week}}.yaml` with 8-12 slots. For each slot: date and time (Europe/Amsterdam), pillar, format, platforms, a one-sentence brief, the assets it needs, and `risk: high` when `config/approval-policy.yaml` says so.

Rules:
- Keep the pillar mix within 5 points of the target; at most one direct sales post in five.
- Prefer one hero asset reused across platforms over separate ideas per platform.
- At most two experiments a week, each with a hypothesis and one metric.
- Respect the caps in `config/platforms.yaml` (`own_cap`) and leave Sunday empty.
- No reactive post on news involving accidents, politics or tragedies.

Then call `request_approval` with gate `weekly_plan` and a summary of what changed versus last week and why. Stop after calling it.
