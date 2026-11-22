# Squad review cases

Real review rounds of this repository, for the squad's reviewer and security roles (#447). The small planted-bug cases of 2026-10-27 could not rank the models (five reviewers scored 12/12) and never showed the empty answers seen in the field, where a packed review is 110-150 KB.

| Case | Issue | Kind | Head | Keys |
|---|---|---|---|---|
| quickfix-defect | #347 | defect | `3b36cb6` | the sensitive-area rule skips the issue body; no test for that rule |
| quickfix-clean | #347 | clean | `edffa1b` | |
| steps-scope-defect | #353 | defect | `a76aba3` | unquoted git lists, a hidden out-of-scope report, a whole-index commit, a write dir outside the repo, a 1 MB buffer |
| steps-scope-merged | #353 | defect | `35cc138` | a relative path read after `cd` (#394), `mapfile` under bash 3.2 (#396) |
| temp-cleanup-round1 | #357 | clean | `b9c6acb` | |
| temp-cleanup-clean | #357 | clean | `ce3308b` | |
| embed-defect | #444 | defect | `58ce92c` | `chrome=0` panels, a prototype read in `open`, unbounded host batches |
| embed-clean | #444 | clean | `969b047` | |

- **Defect case:** the head the first review saw. Its keys in [cases.json](cases.json) are the findings the lead kept and a later step fixed. A run passes when the verdict is `changes` and one finding sits on a key's file and matches its pattern.
- **Clean case:** the head that was merged. A run passes when the verdict is `approve` with no critical or high finding, the merge gate's own rule.
- **A failed run** (empty answer, cut answer, no JSON verdict, HTTP error, timeout) never passes.

The defect heads held more than the keys: later rounds found other real defects. The `Flagged` column of the report counts every `changes` verdict on a defect case, so a model that found another real defect is visible next to the strict count.

## The keys were corrected once, in the open

The first run (2026-11-22, 384 runs) used the merged head of #353 as a clean case and the first head of #357 as a defect case. Many models asked for changes on both, so every critical or high finding on them was checked in the code, blind to the model that raised it.

- **`steps-scope-clean` became `steps-scope-merged`, a defect case.** The merged head held two real blocking defects, both fixed later: `steps.sh` read a relative task folder after `cd` into the worktree (#394, `58966df`) and used `mapfile`, which bash 3.2 lacks (#396, `fa04582`). The other critical or high findings on that head were wrong.
- **`temp-cleanup-defect` became `temp-cleanup-round1`, a clean case.** Its key was the missing owner check in the temp sweep. Another user's `mkdtemp` folder is mode 0700 in a sticky temp folder, so the delete fails and is skipped: the later owner check is hardening, not the fix of a defect a user can hit. None of the 17 critical or high findings on that head blocks a merge.
- **That pack was also built against the wrong base.** `pack.mjs` diffs the checkout against the base's tip, not the merge base. The base given was the tip of main at merge time, so the diff showed main's later changes as reverted, and 8 findings said the pull request reverts #355. The case now uses the branch point, `ae41afe`, and was run again.

The stored answers were scored again with `squad-roles.mjs --rescore`; only `temp-cleanup-round1` was paid for twice.

## Pack the cases

The packs are not committed (2 MB of this repository's own code). Build them with the squad's `pack.mjs`, from a copy of the current `tools/squad/*.mjs` outside the checkout, with the case's head checked out. `<base>` must be the branch point (`git merge-base`), or the diff shows main's later changes as reverted:

```bash
git switch --detach <head>
files=$(git diff --name-only <base>...<head> | paste -sd, -)
node <copy>/pack.mjs --role reviewer --issue <issue> --repo . --base <base> --paths "$files" --files "$files" --brief <issue text file> --max-kb 200 > <packs>/<case id>.reviewer.md
```

Repeat with `--role security`, then switch back to your branch. `--files` takes only the changed files that still exist and are under 40 KB, as the PR steward does. The brief is the issue's title and body.

## Run

```bash
node scripts/squad-roles.mjs --cases tasks/squad-review/cases.json --packs <packs> --models vendor-a/model-x,vendor-b/model-y --runs 3 --out results/<date>-squad-roles.jsonl
node scripts/squad-roles.mjs --report results/<date>-squad-roles.jsonl
```

`run.mjs` reads the OpenRouter key from the user folder, as in any squad run.
