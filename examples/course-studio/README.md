# Syllabus Forge (course studio)

An autonomous **course creation studio** built on the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) (TypeScript).
Give it a topic + audience brief and it researches, designs, writes, produces media, builds
assessments, reviews, pilots with simulated learners and packages a SCORM course for the LMS.
A named subject-matter expert (SME) and the program owner sign off at three checkpoints.

Sample run: **Intro to Prompt Engineering for Product Managers**, 6 modules, SCORM 2004 on Moodle
(`samples/brief.yaml`). This example is meant to be read, not run.

## Open it

```bash
npx flow-tower examples/course-studio/course-studio.tower.yaml
```

12 layers, 109 nodes. Drill into **Module writer**, **Media producer**, **Assessment designer**
and **Review board**; inside the review board, **Fact-check** opens a third level.

| Tower | Layers | Nodes | What it shows |
|---|---|---|---|
| `course-studio.tower.yaml` | 12 | 109 | The whole studio, hybrid runtimes, statuses, resources |
| `towers/module-writer.tower.yaml` | 4 | 18 | Gagné's nine events as a writing pipeline, 3 attempts |
| `towers/media.tower.yaml` | 4 | 18 | Script -> slides/diagrams -> TTS -> captions -> render -> QC |
| `towers/assessment.tower.yaml` | 4 | 18 | Blueprint -> items -> calibration -> rubric + alignment |
| `towers/review-board.tower.yaml` | 4 | 18 | Four parallel reviewers, consolidator, 3-round cap |
| `towers/fact-check.tower.yaml` | 3 | 13 | Claim extraction -> evidence -> per-claim verdict (depth 3) |

## How a course gets made

1. **Brief & direction**: a Haiku router classifies the brief (new / refresh / needs info / decline);
   policy code overrides it for regulated topics or a missing SME. The Opus director plans.
2. **Research**: parallel librarians build a source registry; a PreToolUse hook rejects reuse of
   material whose licence does not allow it. The SME answers five interview questions.
3. **Learning design**: backward design. ABCD objectives with Bloom verbs, an evidence plan, then the
   outline with Gagné's events per lesson. **Checkpoint 1**: SME signs off the outline.
4. **Production**: module writers in parallel (pool of 3, isolated sessions). Hooks gate reading level
   and PII on every write. Media and assessment follow in parallel.
5. **Review board**: pedagogy, fact-check, accessibility (WCAG 2.2 AA) and rights reviewers grade in
   fresh parallel sessions; an Opus consolidator dedupes and decides. Max 3 rounds; the revision
   before the last round runs on Opus; then the SME decides. **Checkpoint 2**: SME content sign-off.
6. **Pilot**: three simulated personas (novice, ESL, screen-reader) take the course in the SCORM Cloud
   sandbox. Finds friction and broken items cheaply; never reported as learner outcomes.
7. **Publish & launch**: deterministic SCORM 2004 4th Ed. packaging (cmi5 optional) behind an
   accessibility gate, conformance smoke test, launch kit behind a claims guard.
   **Checkpoint 3**: the owner approves; only pipeline code (no agent tool) makes the course visible.

## Patterns

| Pattern | Where |
|---|---|
| Routing | `src/intake.ts` (Haiku, JSON schema output, policy overrides) |
| Orchestrator-workers | `src/orchestrator.ts` (`query()` with `agents`, one session resumed across stages) |
| Parallelization (sectioning) | `src/pipelines/modules.ts`, reviewers in `src/loop/review-board.ts`, personas in `src/loop/pilot.ts` |
| Evaluator-optimizer, capped | `src/loop/review-board.ts` (max 3 rounds, Opus on the last revision) |
| Prompt chaining with gates | `src/pipeline.ts` |
| Human in the loop | `src/tools/request-signoff.ts`, `src/pipelines/publish.ts` |
| Hooks as guardrails | `src/hooks/` (licence, reading level, PII, accessibility, answer keys, claims, run fence) |
| Least-privilege subagents | `.claude/agents/*.md` |
| Custom MCP tools | `src/tools/` (`scorm_package`, `lms_upload`, `synthesize_voice`, `render_media`, `request_signoff`) |

## Deployment (runtimes in the tower)
The orchestrator runs in a container (ECS); curriculum design runs interactively in Claude Code on
the lead instructional designer's laptop; TTS (ElevenLabs), SCORM Cloud, Moodle and Notion are SaaS;
video renders on Remotion Lambda; packaging and conformance run in GitHub Actions; analytics on
PostHog. Planned and experimental nodes (adaptive retakes, localization, dubbing, screen-reader
persona) and one deprecated step (batch readability script) show how the studio is evolving.

## Layout

```
.claude/agents/   15 subagents (frontmatter + system prompt, least-privilege tools)
.claude/settings.json  permissions + shell hooks for interactive sessions
.mcp.json         brave-search, context7, notion, playwright, posthog
prompts/          templated prompts ({{brief}}, {{round}}, ...) for agents without a file
src/              pipeline, director, loops, hooks, custom MCP tools, memory
config/           quality gates, reading levels, Bloom verbs, style guide
templates/        course outline, lesson, rubric
samples/          brief, source registry, lesson m3-l2, quiz, imsmanifest.xml
memory/           patterns, session log, glossary, pronunciation lexicon
logs/, scripts/   sample run logs and CI scripts linked from node resources
towers/           nested towers
```

## References

1. Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (2024): routing, parallelization, orchestrator-workers, evaluator-optimizer.
2. Anthropic, [Claude Agent SDK: subagents](https://code.claude.com/docs/en/agent-sdk/subagents): programmatic `agents`, the Agent tool, `.claude/agents/` files.
3. Wiggins & McTighe, *Understanding by Design*; summary by [Vanderbilt Center for Teaching](https://cft.vanderbilt.edu/guides-sub-pages/understanding-by-design/): three stages of backward design.
4. Anderson & Krathwohl (2001), revised Bloom's taxonomy; [Boston University summary](https://www.bu.edu/provost/files/2013/10/Anderson-Krathwohl-Revision-to-Blooms-Taxonomy-of-Educational-Objectives.pdf) of the process and knowledge dimensions.
5. Gagné's nine events of instruction, [Northern Illinois University CITL guide](https://www.niu.edu/citl/resources/guides/instructional-guide/gagnes-nine-events-of-instruction.shtml).
6. Mayer, R. E. (2021), *Multimedia Learning* (3rd ed.), Cambridge University Press: coherence, signaling, redundancy, segmenting, modality.
7. Haladyna, Downing & Rodriguez (2002), "A review of multiple-choice item-writing guidelines for classroom assessment", *Applied Measurement in Education* 15(3); Rodriguez (2005) on three-option items.
8. W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) and [Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/) (1.1.1, 1.2.2, 1.2.3, 1.2.5, 2.4.11, 2.5.8).
9. ADL, [SCORM 2004 4th Edition](https://adlnet.gov/projects/scorm/) and [cmi5](https://github.com/AICC/CMI-5_Spec_Current); 1EdTech [LTI 1.3 / LTI Advantage](https://www.1edtech.org/standards/lti) for tool-style integrations.
10. Allen Interactions, [ADDIE vs. SAM](https://blog.alleninteractions.com/addie-vs-sam-a-comparison-of-common-characteristics): why the studio iterates (review rounds, pilot) instead of running a single linear pass.
11. Articulate, [A practical checklist for evaluating AI-generated content](https://www.articulate.com/blog/a-practical-checklist-for-evaluating-ai-generated-content/): fact-check before publish, invented citations as a typical failure.
12. Rustici Software, [SCORM Cloud API v2](https://cloud.scorm.com/docs/v2/): import jobs, registrations and launch links used by the conformance test.
