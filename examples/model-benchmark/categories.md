# Categories

One category per role a tower node can have (issue #105). Each needs a task set from real work and a pass rule written before the first run.

| Category | What a node in this role must do | Deterministic check | Task set here |
|---|---|---|---|
| coder | Tool loop, edits, tests green | test script on the answer | `tasks/coder/` (3) |
| reviewer | Real defects, no noise | planted bug: expected finding patterns | `tasks/reviewer/` (3) |
| security | Exploitable issues, with an input | planted vulnerability + a decoy that must not be flagged | `tasks/security/` (2) |
| orchestrator (lead / planner) | Orders the steps of a plan by stated rules | exact JSON | `tasks/orchestrator/` (2) |
| planner (plans, task files) | Plans, task files, judgment | plan names the right steps, files and agents, then rubric; or a JSON plan checked against the merged fix | `tasks/planner/` (6) |
| judge (lead-judge) | Keep or drop each review finding, as the lead did | answer key from the real decision; critical findings exact | `tasks/judge/` (3) |
| doc-writer | Accurate, short, verified | required facts as patterns, then rubric | `tasks/doc-writer/` (2) |
| voice / chat agent | First sentence fast, tool use, spoken style | tool calls and answer facts; no Markdown in speech | planned (the six-model run of #70 is the template) |
| intent / classifier | Cheap, fast, structured output | exact JSON | `tasks/intent/` (4: voice commands, airline routing and relevance) |
| tax advisor (commercialista) | Route, label abuse risk, judge citation support, answer only from cited text | exact JSON; quotes found verbatim in the source | `../ai-commercialista/benchmark/tasks/` (4 sets × 2) |
| stt | Transcribe human speech (English, Italian) | word error rate against the book text or a three-family consensus | `tasks/stt/` (2, LibriVox clips) |
| tts | Speak a sentence (English, Italian) | round trip: an STT judge of another family transcribes it, word error rate | `tasks/tts/` (2) |
| long context / summarizer | Read a lot, keep the facts | questions whose answers sit deep in the input, exact JSON | `tasks/summarizer/` (2) |
| writer | Brand or marketing copy against a brief, a voice guide and a claims list | required facts and banned claims as patterns, then rubric | `tasks/writer/` (3) |
| vision | Screenshots and UI checks | exact answer about a known screenshot, exact JSON | `tasks/vision/` (6, images sent with `images:`) |
| data | Extract fields into a JSON schema | exact JSON | `tasks/data/` (2) |
| guard | Flag prompt injection, outgoing data leaks and chat jailbreaks | exact JSON labels | `tasks/guard/` (3) |
| decision | Fixed answers with probabilities (Decisions API) | answers mapped to plain values, exact JSON | `tasks/decision/` (2) |
| embeddings | Retrieve the right passage for a question (English, Italian) | nearest corpus id per query, exact JSON | `tasks/embeddings/` (2) |
| rerank | Put the right passage first | top result index, exact JSON | `tasks/rerank/` (2) |
| image-gen | Draw objects, counts, positions and exact text | a vision judge of another family answers yes/no questions | `tasks/image-gen/` (2) |
| video-gen | A short clip with a clear motion | a video judge of another family answers yes/no questions | `tasks/video-gen/` (2) |

A planned category gets a folder in `tasks/` with at least 2 tasks before it gets runs. `bench.mjs` calls every OpenRouter endpoint a role needs (front matter `endpoint:` `chat`, `decisions`, `embeddings`, `rerank`, `images`, `videos`, `speech`, `transcriptions`); media answers are saved under `artifacts/` next to the results file and judged there.

Two runs on 2026-10-16:
- **Across families**, every category except planner, writer and summarizer: [results/2026-10-16-roles/](results/2026-10-16-roles) and the pick per role in the [role catalogue](../../skills/flow-tower-costs/catalogue.md).
- **Per node, within the harness's family**, for the models the tower optimizer flagged (coder, reviewer, planner, writer, summarizer, doc-writer, intent, vision): [results/2026-10-16-tower-nodes.md](results/2026-10-16-tower-nodes.md).
