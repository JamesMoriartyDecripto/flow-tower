# {{title}} - Game Design Document

Template filled by the game designer, economy balancer, narrative writer and UX researcher.
Each section is graded separately by the design critic (pass >= 8/10, max 3 rounds).
Every mechanic must name the pillar it serves and a measurable goal QA can check.

## 1. Vision
- One-line hook:
- Pillars (max 3, from the creative director):
- Target audience and comps:
- Platforms, session length, player count:

## 2. Core loop
| step | player verb | reward | pillar | goal (measurable) |
|---|---|---|---|---|
| explore | | | | e.g. 80% of players find 2+ caches per island |
| gather | | | | |
| craft | | | | e.g. first craft under 3 minutes |
| rekindle | | | | |

## 3. Mechanics
For each mechanic: description, controls, states, failure cases, tuning knobs, telemetry events.

## 4. Economy
- Resources, sources and sinks (link `config/economy.yaml`).
- Target curve: resources per minute vs unlocks; simulate_economy percentiles attached.

## 5. World & levels
- Biomes, island archetypes, POI types and densities (link `config/worldgen.yaml`).
- Run structure and pacing targets (beacon every 5-7 minutes).

## 6. Narrative
- Premise, factions, the Keeper's arc in the slice, beat sheet (link `docs/storyboard-template.md`).

## 7. UX & UI
- Onboarding steps, HUD elements and their priority, accessibility options.

## 8. Co-op
- Join flow, shared vs personal progression, downed/revive rules, scaling per player count.

## 9. Scope & risks
- In the vertical slice / explicitly out. Top 5 risks with owner and mitigation.

## 10. Acceptance criteria
Checklist QA bots and reviewers verify for the milestone.
