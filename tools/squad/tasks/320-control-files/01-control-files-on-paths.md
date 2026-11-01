# 320-13: control files are checked on file lists, not on prose

Rules: English only; never touch secret files; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum: one new regex, no new helpers beyond it. Verify: run test on tests/squad-runner-fix-scope.test.ts, tests/squad-runner-core.test.ts and tests/squad-runner-contracts.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read tools/squad/runner-core.mjs and tests/squad-runner-fix-scope.test.ts.

Why: the external acceptance replay stopped at triage with "sensitive area: a person must lead this issue" because the issue body says, as context, "The repo already has package.json and project rules in tools/squad/squad.json". tools/squad/runner-core.mjs line 12 reads exactly:
const SENSITIVE = /auth|billing|payment|migration|permission|secret|privacy|personal|pii|gdpr|\.github\/|tools\/squad\/|package(-lock)?\.json/i;
and it is tested on the issue title and body (line 198), so naming a file in prose stops the issue. The control-file rule is about which files a change edits, so it belongs on file lists only.

1. Restore SENSITIVE to the words only: `/auth|billing|payment|migration|permission|secret|privacy|personal|pii|gdpr/i`. Add `const CONTROL_FILE = /(^|\/)(\.github|tools\/squad)\/|(^|\/)package(-lock)?\.json$/i;` with the comment now above SENSITIVE (CI and runner files need a person because a change to them changes how the checks and the squad run), adapted to say it is tested on file paths.
2. Test CONTROL_FILE on each path: in sensitivePlan, also stop when any plan step file matches; in the fix round, also stop with FIX_SENSITIVE when any of filePaths matches. The issue-text check at line 198 keeps using SENSITIVE only.
Append tests to tests/squad-runner-fix-scope.test.ts: an issue body mentioning package.json and tools/squad/squad.json in prose, with a plan on src/ files, reaches 'pr'; a plan whose step files include package.json stops with the plan sign-off message; the existing supporting `.github/workflows/ci.yml` and `tools/squad/squad.json` cases still stop.
Files: tools/squad/runner-core.mjs, tests/squad-runner-fix-scope.test.ts
