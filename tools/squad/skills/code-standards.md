When: every code change (coder), and every review (reviewer: a breach below is a finding that cites its rule, "standards 3", medium unless it hides a bug; skip what a test or the typecheck already enforces).

Kept by the lead (#457): rules come from the principles the maintainer works by, or from a real failure here, named by issue; a rule leaves when a test, a lint
or steps.sh enforces it; when a review or a red step shows a class of mistake no rule covers, the lead adds one at the
issue close; this file stays under 4 KB. Task-specific know-how goes in its own skill.

1. Fix the cause, not the symptom. Trace a failure to the first wrong decision and change it there. A try/catch that
   swallows, a retry, a default or a clamp is a fix only when the state it handles is legitimate; say which state.
2. Validate where data enters (CLI args, files, env, network, model answers). Inside, trust the values: no second
   check of what a caller already checked.
3. One source of truth. Before writing a helper, grep for one that exists and call it. A second copy of a rule or a
   constant is a bug waiting (#455: a third copy of an existing function).
4. Fewest layers and the least state. No wrapper with one caller; const over let; return a value rather than mutate
   a shared one; keep a variable in the smallest scope that needs it.
5. The smallest change that does the task. No option, flag, abstraction or check the task does not ask for.
6. Before changing a printed message, a file format or an exported name, grep tests/ and the repo for every reader
   and update them in the same step (#452: two tests read a heading the step changed).
7. Comments say why, in one or two lines; never what the next line does, and never a history of edits.
