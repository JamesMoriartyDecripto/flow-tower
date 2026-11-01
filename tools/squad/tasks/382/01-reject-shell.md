# 382: reject a command that needs a shell

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: one regex and one check, no new helpers. Verify: run test on tests/squad-config.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/config.mjs and tests/squad-config.test.ts.

Why: commandArgv splits a command on whitespace and runs it without a shell, so `docker build . >/dev/null && bash x.sh` reaches docker as broken arguments and every step goes red. loadConfig should refuse it up front (squad doctor already calls loadConfig).

1. In loadConfig, right after the loop at line 74 that checks each commands entry is a string, refuse an entry containing shell syntax: `&&`, `||`, `|`, `;`, `>`, `<`, `$(`, a backtick, `'` or `"`. Use fail(`commands.${name}`, 'uses shell syntax, but the runner runs it without a shell: put it in a script of the project and call that script').
Append tests to tests/squad-config.test.ts: loadConfig fails with that message for `docker build . >/dev/null && bash x.sh`, `a | b` and `echo $(pwd)`; it passes for `bash tools/ci/check.sh`, `npm run check` and `pytest -q {file}`.
Files: tools/squad/config.mjs, tests/squad-config.test.ts
