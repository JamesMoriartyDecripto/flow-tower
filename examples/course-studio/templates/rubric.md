# Rubric: {{task_title}}

**Task**: {{task_description}}
**Objectives assessed**: {{objective_ids}}
**Scoring**: analytic, 4 criteria x 4 levels, max 16 points. Pass = 11 (mastery 0.7) and no criterion at level 1.

| Criterion (objective) | 4 - Exemplary | 3 - Proficient | 2 - Developing | 1 - Beginning |
|---|---|---|---|---|
| **C1 Task clarity** (O3) | Spec states role, task, audience, output format and success criteria; a colleague could run it unchanged. | All elements present; one is vague. | Task and format present; audience or criteria missing. | Task is a one-line request. |
| **C2 Examples** (O4) | 2-3 examples cover the normal case and an edge case; formats match the requested output exactly. | 2 examples, consistent format, no edge case. | One example, or examples contradict the format. | No examples. |
| **C3 Evaluation plan** (O7) | 20+ test cases incl. edge and adversarial; pass criteria measurable; owner and cadence named. | 10-19 cases, measurable criteria. | Fewer than 10 cases or criteria not measurable. | "We will check the outputs." |
| **C4 Risk and trade-offs** (O6) | Names cost, latency and failure modes with a mitigation for each; justifies the model choice with data. | Names trade-offs and mitigations without data. | Names risks without mitigations. | No risks identified. |

## Anchor samples
- Level 4: `assessment/anchors/{{task_id}}-L4.md`
- Level 3: `assessment/anchors/{{task_id}}-L3.md`
- Level 2: `assessment/anchors/{{task_id}}-L2.md`
- Level 1: `assessment/anchors/{{task_id}}-L1.md`

## Grader notes
- Score each criterion independently; quote the evidence from the submission.
- Descriptors describe what is observable in the work, not effort or tone.
- AI-assisted pre-scoring is allowed; a human confirms every score below 11 or any level-1 criterion.
