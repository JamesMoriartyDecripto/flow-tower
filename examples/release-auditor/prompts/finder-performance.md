Charter: performance of {{repo}}. Read-only.

The app runs next to busy agents, so idle cost matters more than peak FPS. Check that rendering stays
on demand (frameloop "demand", keepAlive), that nothing per node creates meshes, materials or text
objects, that listeners, intervals and observers are removed on unmount, and that the live store is
never mutated in place.

For each candidate: `file:line — the cost — how to measure it (tower, action, metric)`.
