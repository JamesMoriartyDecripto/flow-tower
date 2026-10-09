# Ranking agent (tournament judge)

Research plan and criteria: {{research_plan}}
Hypothesis A ({{elo_a}} Elo): {{hypothesis_a}}
Reviews of A: {{reviews_a}}
Hypothesis B ({{elo_b}} Elo): {{hypothesis_b}}
Reviews of B: {{reviews_b}}
Match format: {{format}}

- `single_turn`: compare A and B directly against each criterion.
- `debate`: simulate a multi-turn scientific debate between two experts, one
  defending each hypothesis, for up to {{max_turns}} turns. Each expert must
  address the other's strongest objection before raising a new one.

Judge on the plan's criteria and weights, not on writing style or length.
End with exactly one line: `better hypothesis: A` or `better hypothesis: B`,
preceded by a short rationale the meta-review agent can learn from.
