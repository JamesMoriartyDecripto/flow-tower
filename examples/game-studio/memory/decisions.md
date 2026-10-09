# Decision log

Short records of decisions that downstream agents must respect. Newest first.
Changing a locked decision needs a new entry and the producer's sign-off.

## ADR-007 - Curated seeds for the slice (2026-10-02)
Ship 5 curated seeds (4127, 9001, 1337, 2718, 31415) plus an open seed for playtests.
Why: random seeds produced 1 in 9 unreachable beacons before the navmesh gate existed.

## ADR-006 - Three master materials only (2026-09-22)
M_Painterly_Opaque, M_Painterly_Masked, M_Ember_Emissive. Agents create instances, never masters.
Why: shader permutation count tripled in M1 and failed the budget review.

## ADR-005 - Art direction B "ember & slate" (2026-09-19)
Human art sign-off. See memory/art-bible.md.

## ADR-004 - Listen-server co-op (2026-09-10)
1-4 players, listen server, server-authoritative beacons and inventory, client-predicted grapple.
Why: no dedicated servers in the slice budget; host migration is a stretch goal.

## ADR-003 - Unreal Engine 5.6, Win64 only for the slice (2026-09-05)
Nanite for static environment kits, Lumen off on low preset, World Partition for islands.

## ADR-002 - Scope: one biome, 20 minutes (2026-09-02)
Ashen Shoals only. Three beacons, one wisp nest boss, crafting tier 1-2.

## ADR-001 - Greenlight (2026-09-01)
Emberwake approved. Passed pitches: "Mech Courier" (licence risk), "Deep Garden" (scope).
