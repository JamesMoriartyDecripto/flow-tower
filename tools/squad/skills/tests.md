When: the step adds or changes a test.

Kept by the lead (#457), as code-standards.md: a rule leaves once a check enforces it.

1. Test what a user of the code can observe: a return value, an error, the output and exit code of a CLI, a file
   written. Not a private helper, not the order of internal calls.
2. Drive it through its public entry (the exported function, or the script with its real arguments) with a concrete
   input, and write the expected value from the task's requirement, never computed the way the code computes it (a tautology passes on a wrong formula).
3. A new test must fail on the code before the change: say in the report what the old code would print.
4. Change an existing assertion only when the behaviour changed on purpose, and say so in the report. Never loosen
   one so that a step goes green.
5. Pair "this never happens" with the case where it does: a refused input next to an accepted one.
6. Verify with `run typecheck` as well as the test file: a test that passes can still break the build (#447).
7. Mock only what crosses the system edge (the network, the clock, randomness, a child process the test cannot run).
   Never mock a module of this repo: call it.
8. Name a test by the capability it proves ("refuses a base with no common commit"), not by the function it calls.
