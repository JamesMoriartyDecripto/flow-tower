---
id: steps-scope
category: judge
check: command
command: steps-scope.check.mjs
tools: read_file
files: fixtures/steps-scope.patch
steps: 6
---
# Keep or drop the review findings: steps.sh commit scope

From real work: Flow Tower issue #353, review round 1 (2026-10-31). The reviewer and security models ran on the packed diff of commit a76aba3; the lead checked each finding in the code and kept or dropped it. Finding texts are condensed from the real outputs.

## Prompt

You are the lead of a coding squad. A pull request changes `tools/squad/steps.sh` so each step commits only its own files. A new `tools/squad/step-scope.mjs` decides what a step may stage, and local edits from before the run are never staged. It also skips finished steps (a commit whose subject ends `, step <step> (#<issue>)`) and gives the coder the folders of the task's `Files:` entries. The coder model edits files through a tool loop with read, write and run-the-checks tools; it has no git tool.

Read the diff with the read_file tool: `fixtures/steps-scope.patch`. Then decide, for each finding below, **keep** (a real defect that this pull request introduces, or makes reachable or worse even on a line it does not touch: it becomes a fix step now) or **drop** (wrong, harmless, already handled, or a pre-existing defect this pull request does not affect: to be tracked in a separate issue).

- **R1** (reviewer) `tools/squad/step-scope.mjs` `stage`: the changed list comes from `git diff --name-only` and `git ls-files --others` without `-z`, while the snapshot uses `status -z`. With core.quotePath, git quotes non-ASCII names, so they never match.
- **R2** (reviewer) `tools/squad/steps.sh`: when the coder changed only out-of-scope paths, `staged` is empty and the run says "the coder changed nothing" before the CHANGED, NOT COMMITTED report is reached, hiding what was changed.
- **S1** (security, high) `tools/squad/steps.sh`: the commit takes the whole index. Nothing unstages what was already there, so a file the maintainer had `git add`-ed before the run is committed with the step.
- **S2** (security, medium) `tools/squad/step-scope.mjs` `dirOf`: a `Files:` entry that is absolute or walks up (`/etc/passwd`, `../../x`) yields a write dir outside the repository, handed to the coder.
- **S3** (security, low) `tools/squad/steps.sh`: a step counts as done purely from a commit subject suffix. Any commit with that subject, for example one made by the coder through its own tools, would mark a step done.
- **S4** (security, low) `tools/squad/step-scope.mjs` `hashPaths`: `git hash-object --stdin-paths` runs with the default 1 MB maxBuffer; a checkout with tens of thousands of changed files aborts the run.
- **S5** (security, low) `tools/squad/steps.sh`: paths travel as newline-delimited text, so a legal filename that contains a newline is split.

Answer with one fenced js block and nothing else: `export default { R1: 'keep' | 'drop', R2: ..., S1: ..., S2: ..., S3: ..., S4: ..., S5: ... };`

## Expected

The lead's decisions on the day:
- **Kept:** R1, R2, S1, S2 and S4. All five were fixed in step 04 (NUL-safe lists, an "outside" report, a pathspec commit, refusing absolute and `..` entries, a 20 MB buffer).
- **S3 dropped:** the coder has no git tool, and a commit with that subject on the branch is the lead's own.
- **S5 dropped** on the day: the git lists became NUL-safe, and a newline inside a tracked path is out of scope. The bash side still reads lines, so keeping it is defensible: **either answer is accepted** for S5.

S1 and S2 are critical. Passing needs both kept and at least 5 of the 6 scored decisions matching.
