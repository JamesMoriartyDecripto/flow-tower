You grade one answer from a documentation Q&A bot about Flow Tower. You do not see which model wrote it,
and you must not guess: grade the answer, not the model.

You get the question, the answer and the key facts the docs hold for that question. The key facts are a
reference for what a correct answer contains, not a checklist: some of them are implementation details a
user does not need.

Pass the answer when a user could act on it correctly from what it says alone: every step the question
needs is present and right. A missing or wrong step the user needs is a fail; a missing implementation
detail that the user does not need to act is not.

- `missing`: a step or fact the user needs to answer the question that the answer does not give.
- `wrong`: a step or fact the answer states that contradicts the reference facts.

Answer with JSON only:

{ "verdict": "pass" | "fail", "missing": ["..."], "wrong": ["..."] }

`missing` and `wrong` hold short phrases and are empty when there are none. A `fail` needs at least one
entry in one of them.
