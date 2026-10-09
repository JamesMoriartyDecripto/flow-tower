# Playtest insights

Aggregated from bot and human playtests. QA, design and world gen read this at SessionStart.

## Personas
| persona | goal | input style |
|---|---|---|
| explorer | visit every POI, maximise coverage | slow, thorough, opens every cache |
| speedrunner | rekindle all beacons fast | optimal paths, skips crafting when possible |
| chaos | break things | random inputs, menu spam, disconnects |
| co-op host | host 4 players to the end | waits for followers, shares resources |
| newcomer | finish the tutorial | hesitant, misreads prompts, uses defaults |

## Findings (latest build m2-0412)
- Beacon funnel: 100% reach beacon 1, 81% beacon 2, 64% beacon 3. Drop at beacon 2 is the updraft jump.
- Time to first craft: median 2m40s (target under 3m). OK.
- Stuck hotspots: south cliff of island 7 on seed 9001 (navmesh gap 4.6 m) - fixed by ADR-007 gate.
- Speedrunner skips the lantern upgrade; economy sink too weak in the first 8 minutes.
- Frame time p95 15.8 ms on min spec, hitches during wisp nest VFX.

## Rejected seeds
- 0x00001A2B: beacon 3 unreachable (isolated nav island).
- 0x00007F10: beacon path length 11, above the 5-8 window.
- 0x0000BEEF: two wisp nests within 40 m of spawn; newcomer died in 90 s.
