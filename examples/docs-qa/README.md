# Docs Q&A

A bot that answers questions about Flow Tower from **this repository's own docs** (#110), dogfooded:
the tower sets `root: ../..`, so every node opens the real doc or script it describes.

Retrieval is **just-in-time routing, not embeddings**. The docs are written for it (#101): CLAUDE.md's
"Load on demand" table maps tasks to docs, and every doc in `docs/` opens with what it covers, when to
read it and where to go instead. So the router reads only that table and those first lines, picks at most
two docs, and loads only their relevant sections. No index to build or keep in sync.

## When to use it

- As a model for a docs bot over a small, well-structured doc set (tens of files), where a routing
  table beats a vector store: no ingest job, exact citations, and failures that point at a doc to fix.
- To check the Flow Tower docs themselves: the eval's failures are doc gaps.

For a classic embeddings pipeline, start from [`starters/rag-bot`](../starters/rag-bot).

## The two flows

**Answer:** question → router (cheap model call; keyword fallback) → JIT load → answer writer (cites
`file#heading`) → citation guard (the file and heading exist and the section contains the claim; one loop
back to the writer, then "Not in the docs" plus the closest doc) → reply.

**Eval (the doc-gap loop):** [`evals/questions.md`](evals/questions.md) (24 real questions, each with the
expected doc and 1–3 key facts read from the docs) → runner → scorer (fails on a wrong route, a missing
fact or a bad citation) → `gaps.md` → a doc-writer proposes the fix, a maintainer reviews it → docs →
run again. A gap is fixed in the doc, not in the bot: a sharper first line or CLAUDE.md row when the route
is wrong, the missing fact under one heading (one home per fact) when the answer is wrong.

## Run it

Node 22, no dependencies. From the repository root:

```bash
node examples/docs-qa/scripts/answer.mjs --dry-run "How do I pause sharing?"   # routing only, offline
node examples/docs-qa/scripts/eval.mjs --dry-run --out /tmp/gaps.md            # routing score, offline
```

A real run calls [OpenRouter](https://openrouter.ai). Export `OPENROUTER_API_KEY` in your shell (never
put it in a file in the repo; the scripts never print it), then:

```bash
node examples/docs-qa/scripts/answer.mjs "How do I connect my laptop to the hub?"
node examples/docs-qa/scripts/eval.mjs                       # writes examples/docs-qa/gaps.md
node examples/docs-qa/scripts/eval.mjs --model <id> --only Q12,Q13
```

`answer.mjs` prints the answer with citations, then one JSON line `{ docs_loaded, routed_by, tokens,
cost, ms }`. Calls use low reasoning effort, `provider: { data_collection: 'deny' }`, a 45 s timeout and
one retry. Copied out of this repo, set `DOCS_QA_ROOT` to a flow-tower clone.

## Cost and model choice

The default is `google/gemini-3.5-flash-lite` (the same model the voice agent uses). Do not pick on price
alone: benchmark candidates on this eval with the [cost skill](../../skills/flow-tower-costs/SKILL.md) and
the benchmark method of [#108](https://github.com/JamesMoriartyDecripto/flow-tower/issues/108), and keep
the cheapest model that passes. The routing score in the tower (18/24) is the first dry run with the
keyword router, before any doc fix: illustrative.

## Files

| File | What |
|---|---|
| `docs-qa.tower.yaml` | the tower: answer flow, docs read, eval flow |
| `scripts/answer.mjs` | one question: route, load, write, guard |
| `scripts/eval.mjs` | the question set, scored; writes `gaps.md` (`--out` elsewhere) |
| `scripts/lib.mjs` | catalog, keyword router, section loader, OpenRouter call, citation guard |
| `prompts/` | router, answer writer, guard feedback |
| `evals/questions.md` | the eval set |

## Sources

- [CLAUDE.md](../../CLAUDE.md) "Load on demand" table and the doc headers in [docs/](../../docs) (#101).
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents): just-in-time loading over pre-retrieval.
- [OpenRouter API reference](https://openrouter.ai/docs/api-reference/overview): chat completions, `reasoning`, `provider.data_collection`, usage accounting.
