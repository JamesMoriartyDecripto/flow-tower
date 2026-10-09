Write {{count}} multiple-choice items for objective {{objective_id}}: "{{objective}}".
Bloom level: {{bloom_level}}. Lesson section: {{lesson_ref}}.

## Misconceptions to target (from the research pack)
{{misconceptions}}

## Item rules
- Scenario stem for Apply and above: a short, realistic PM situation with the needed details.
- The stem is a complete question. A prepared learner can answer before reading the options.
- Exactly one best answer. {{options}} options (default 3).
- Each distractor encodes one listed misconception. Plausible to someone who has the misconception.
- Options are homogeneous in content and grammar, similar in length, no overlapping meanings.
- Never: "all of the above", "none of the above", "A and C", double negatives, trick wording.
- Avoid negatives in the stem. If unavoidable, put the negative in **bold**.
- Do not reuse sentences from the lesson verbatim (that tests recognition, not application).

## Feedback
For EVERY option: one or two sentences on why it is right or wrong, naming the misconception,
and a pointer to the lesson section.

## Output (JSON array, schema as in samples/quiz-m3.json)
Fields: id, objective, bloom, stem, options[{id, text, correct, feedback}], difficulty_estimate,
rationale. Write keys only into assessment/keys/.
