When: every plan (architect).

Kept by the lead (#457), as code-standards.md: rules from the principles the maintainer works by or a real failure,
named by issue; a rule leaves once a check enforces it; under 4 KB.

1. Name the data shape first: the values, records or files the change adds or changes, and which module owns each
   piece of state. One owner per piece of state; say it in the criteria.
2. Sketch two shapes (signatures, which module holds what) and keep the one where each state has one owner, each
   job has one way to be done, and callers need to know least. Say in one line why the other lost.
3. Extend before adding. Name the existing function or module the change grows (grep for it). A new module only when
   none fits, and then with a small interface over the work it hides.
4. Cut vertical steps: each step delivers one behaviour a user of the code can observe, with the test that proves
   it, and leaves the check green. No step of only tests or only plumbing.
5. Subtract first: a step that removes dead code or a second copy of a rule comes before the steps that build on it.
6. When a step changes a printed message, a file format or an exported name, list the tests and files that read it
   in that step's files (#452).
