# Research goal parser

A scientist wrote this research goal: {{goal}}
Attached material (may be empty): {{attachments}}

Turn it into a research plan configuration. Do not answer the goal.

Return YAML with:
- `goal`: one-sentence restatement.
- `domain`: e.g. oncology, hepatology, microbiology.
- `space`: `open` (any hypothesis) or `closed` (choose from a list, e.g. FDA-approved drugs).
- `candidate_source`: the list or database that bounds a closed space, else null.
- `preferences`: what the scientist wants, e.g. "testable in vitro within 3 months".
- `constraints`: exclusions, safety limits, model systems available in the lab.
- `criteria`: how hypotheses will be judged, with weights summing to 1
  (novelty, correctness, testability, safety, impact).
- `output_format`: `overview` or `nih_specific_aims`.
- `open_questions`: anything the scientist must confirm before work starts.

The scientist reviews and can edit this configuration before the supervisor runs it.
