---
id: temp-cleanup
category: judge
check: command
command: temp-cleanup.check.mjs
tools: read_file
files: fixtures/temp-cleanup.patch
steps: 6
---
# Keep or drop the review findings: temp-file cleanup

From real work: Flow Tower issue #357, review rounds 1 and 2 (2026-10-31), on the diff of commit b9c6acb. The lead checked each finding in the code and kept or dropped it. Finding texts are condensed from the real outputs.

## Prompt

You are the lead of a coding squad. A pull request stops temp files from filling the disk:
- a vitest `globalSetup` (`tests/global-tmp.ts`) gives each test run its own TMPDIR under the system temp folder, removes it at the end, and sweeps `flow-tower-tests-*` folders older than 24 hours left by crashed runs;
- `tools/squad/steps.sh` removes its output folder after ALL GREEN, and the user's own `squad-*-??????` folders older than 7 days;
- `tools/squad/run.mjs` prunes its role logs (in the checkout's `tools/squad/`) beyond the newest 200 that are older than 14 days.

The system temp folder can be shared with other users on the machine.

Read the diff with the read_file tool: `fixtures/temp-cleanup.patch`. Then decide, for each finding below, **keep** (a real defect that this pull request introduces, or makes reachable or worse even on a line it does not touch: it becomes a fix step now) or **drop** (wrong, harmless, already handled, or a pre-existing defect this pull request does not affect: to be tracked in a separate issue).

- **S1** (security, low) `tests/global-tmp.ts`: the sweep decides age with `statSync`, which follows a symlink, and never checks the entry is a directory. Anyone who can write to the shared temp folder can plant a `flow-tower-tests-x` symlink.
- **S2** (security, low) `tools/squad/log-prune.mjs`: the prune is scoped by file name and location only, never by owner. Stale role logs in that folder written by another user or session are removed too.
- **S3** (security, low) `tools/squad/steps.sh`: the pattern `squad-*-??????` matches any folder of that shape, not only the script's own output folders; the test suite creates such folders too.
- **S4** (reviewer and security, round 2) `tests/global-tmp.ts`: the sweep checks name, age and type but not the owner, unlike `steps.sh`, which filters with `-user "$(id -u)"`. In a shared temp folder, another user's run folder would be deleted.

Answer with one fenced js block and nothing else: `export default { S1: 'keep' | 'drop', S2: ..., S3: ..., S4: ... };`

## Expected

The lead's decisions on the day:
- **S4 kept:** the sweep now removes only folders the current user owns.
- **S1 kept on the day, but harmless on review:** `rmSync` removes a symlink itself and never follows it, so a planted link cannot get another folder deleted. The lead hardened it anyway (`lstat`, directories only); **either answer is accepted** for S1.
- **S2 dropped:** the logs live in the checkout's own runner folder.
- **S3 dropped:** removing the user's own squad temp folders older than 7 days, test leftovers included, is the intent.

S4 is critical: dropping it would delete other users' folders. Passing needs S4 kept and S2, S3 matching (S1 is not scored).
