# Categories

One category per role a tower node can have (issue #105). Each needs a task set from real work and a pass rule written before the first run.

| Category | What a node in this role must do | Deterministic check | Task set here |
|---|---|---|---|
| coder | Tool loop, edits, tests green | test script on the answer | `tasks/coder/` (2) |
| reviewer | Real defects, no noise | planted bug: expected finding patterns | `tasks/reviewer/` (2) |
| security | Exploitable issues, with an input | planted vulnerability + a decoy that must not be flagged | `tasks/security/` (2) |
| lead / planner | Plans, task files, judgment | plan names the right steps, files and agents, then rubric | `tasks/planner/` (2) |
| doc-writer | Accurate, short, verified | required facts as patterns, then rubric | `tasks/doc-writer/` (2) |
| voice / chat agent | First sentence fast, tool use, spoken style | tool calls and answer facts; no Markdown in speech | planned (the six-model run of #70 is the template) |
| intent / classifier | Cheap, fast, structured output | exact JSON | `tasks/intent/` (4: voice commands, airline routing and relevance) |
| STT / TTS | Transcribe / speak | word error rate on recorded phrases; first audio time | planned: needs audio, not chat completions |
| long context / summarizer | Read a lot, keep the facts | questions whose answers sit deep in the input, exact JSON | `tasks/summarizer/` (2) |
| writer | Brand or marketing copy against a brief, a voice guide and a claims list | required facts and banned claims as patterns, then rubric | `tasks/writer/` (2) |
| vision | Screenshots and UI checks | exact answer about a known screenshot | planned: `bench.mjs` sends text only |

A planned category gets a folder in `tasks/` with at least 2 tasks before it gets runs. STT and TTS do not fit `bench.mjs` (it speaks chat completions): measure them with their own runner and record them in the same table format.
