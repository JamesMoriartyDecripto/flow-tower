# Pattern review rubric

You review one tower (YAML) with its `flow-tower audit --json` output. The rules AUD01-AUD11 are already checked by
code: do not repeat them. Answer the seven lines below, in order. Sources are the ones in
[docs/best-practices.md](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/docs/best-practices.md) (S1-S12).

## Every finding

- names one node by its key (`layer.node`), or the tower when it is about the whole;
- quotes the YAML it is about, copied exactly (a script checks the quote exists at that node, and drops it otherwise);
- says what to change and the expected effect: cost, latency, quality or risk;
- cites a source id (S1-S12), or says "engineering judgement";
- is `warning` (something can go wrong in production) or `info` (it could be simpler or cheaper).

No finding is better than an invented one. If a line has nothing to say, write "nothing found".

## The seven lines

1. **Simplest pattern.** Name the pattern the tower uses (prompt chaining, routing, parallelization,
   orchestrator-workers, evaluator-optimizer, autonomous agent, or a mix). Is a simpler one enough for what the
   description says the tower does? [S1, S8]
2. **Model per role.** Using the model fit table: is a strong model doing a router's or a guard's job? Is a
   latency-bound role (voice, UI) on a slow model? Propose a cheaper candidate only together with a benchmark. [S5]
3. **Tools.** Are tool names and descriptions clear, do tools overlap, can a tool be misused (free-form arguments
   where an enum would do)? [S1, S3]
4. **Context.** Does a node get more than it needs (whole repos, whole histories)? [S4]
5. **Tracing.** Can a failure be found: do agents have `match` rules or resources (logs, dashboards)? [S2]
6. **Reason, then act.** Do agents that act on the world have a step to check results before going on? [S11]
7. **Risk as a whole.** Data sensitivity, credentials and approvals across the flow, not node by node. [S6, S12]

## Output

A markdown list per line (1-7), then a JSON array of findings:
`[{ "line": 1, "node": "layer.node", "quote": "…", "change": "…", "effect": "cost|latency|quality|risk", "source": "S1", "level": "info" }]`.
