# Forge Studio

An autonomous **AI game development studio** built on the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) (TypeScript).
Give it a pitch and it runs greenlight, research, pre-production, concept art, Blender asset
production, Unreal integration, procedural world generation, engineering, review gates,
bot playtests, release and launch marketing, with humans signing off at three checkpoints.

This is the large flow-tower example, meant for reading, stress tests and UX evaluation, not
for running. The project inside is **Emberwake**, a co-op survival-crafting roguelite.

## Open it

```bash
node bin/flow-tower.js examples/game-studio/game-studio.tower.yaml
```

14 layers, 141 nodes. Six nodes drill into nested towers (art pipeline, Unreal integration,
world gen, engineering, QA, marketing); two of those go one level deeper (material bake,
playtest bot).

## What it demonstrates

| Pattern | Where |
|---|---|
| Routing | `src/greenlight.ts` (Haiku pitch intake, JSON schema) |
| Orchestrator-workers | `src/studio.ts` (Opus producer, `query()` with `options.agents`) |
| Parallel fan-out / fan-in | `src/pipeline.ts`, `src/departments/art.ts`, `src/departments/qa.ts` |
| Evaluator-optimizer with caps | `src/loop/review-gate.ts`, `config/quality-gates.yaml` |
| Human in the loop | `src/tools/request-approval.ts` (greenlight, art_direction, release_go_no_go) |
| Guardrail hooks | `src/hooks/` (asset budget, licence/IP, secret scan, build gate, cost ledger) |
| Custom MCP tools | `src/tools/` (forge server) |
| External MCP | `.mcp.json` (Blender, Unreal, image gen, GitHub, Figma, analytics) |
| DCC / engine scripts | `pipelines/blender/*.py`, `pipelines/unreal/*.py`, `pipelines/worldgen/*.py` |
| Least-privilege subagents | `.claude/agents/*.md` |
| Memory | `CLAUDE.md`, `memory/*.md` |

## Operational fields used

Top-level `budget` ($400 per pitch-to-launch run), agent `budget` (`maxBudgetUsd` per query),
`limits` (6 concurrent department agents, 8 parallel playtest bots, review and regression caps as
`max_iterations`), `approval` on the human checkpoints (review portal + GitHub issue + Slack, 72h then
`reject`) and on the community manager `when` publishing, `trigger` (daily standup cron, bug-triage
webhook), score `decision` thresholds (pitch fit >= 0.6, reviews >= 8) and a multi-dimension `fanout`
for the playtest matrix (persona × seed × graphics preset).

## Layout

```
.claude/agents/   20 subagents (frontmatter + system prompt)
prompts/          22 templated prompts for prompt-defined agents
src/              orchestrator, departments, review loops, hooks, forge MCP tools, memory
pipelines/        Blender bpy, Unreal editor Python, world gen, playtest bot policy
config/           asset budgets, style tokens, quality gates, worldgen, economy, platforms
docs/             pitch, GDD and storyboard templates
memory/           patterns, decisions, art bible, playtest insights, competitors, session log
towers/           nested towers
```
