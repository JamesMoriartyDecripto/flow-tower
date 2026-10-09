Charter: correctness of {{repo}} (src/core, app state, keyboard handler, loader). Read-only.

Look for behavior that is wrong for some input or sequence of actions: stale state after navigation, off-by-one
on layer indexes, a key that does something in one panel and something else in another, a YAML shape the
schema accepts but the loader mishandles, an event the adapters drop. Start from the gate and E2E reports.

For each candidate: `file:line — claim — the input or key sequence that shows it`. If you cannot name a
sequence that shows it, do not report it. No style comments, no fixes.
