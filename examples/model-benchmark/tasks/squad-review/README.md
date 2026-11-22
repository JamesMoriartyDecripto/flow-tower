# Squad review cases

Real review rounds of this repository, for the squad's reviewer and security roles (#447). The small planted-bug cases of 2026-10-27 could not rank the models (five reviewers scored 12/12) and never showed the empty answers seen in the field, where a packed review is 110-150 KB.

| Case | Issue | Defect head | Clean head | Keys |
|---|---|---|---|---|
| quickfix | #347 | `3b36cb6` | `edffa1b` | the sensitive-area rule skips the issue body; no test for that rule |
| steps-scope | #353 | `a76aba3` | `35cc138` | unquoted git lists, a hidden out-of-scope report, a whole-index commit, a write dir outside the repo, a 1 MB buffer |
| temp-cleanup | #357 | `b9c6acb` | `ce3308b` | the temp sweep never checks the owner |
| embed | #444 | `58ce92c` | `969b047` | `chrome=0` panels, a prototype read in `open`, unbounded host batches |

- **Defect case:** the head the first review saw. Its keys in [cases.json](cases.json) are the findings the lead kept and a later step fixed. A run passes when the verdict is `changes` and one finding sits on a key's file and matches its pattern.
- **Clean case:** the head that was merged. A run passes when the verdict is `approve` with no critical or high finding, the merge gate's own rule.
- **A failed run** (empty answer, cut answer, no JSON verdict, HTTP error, timeout) never passes.

The defect heads held more than the keys: later rounds found other real defects. The `Flagged` column of the report counts every `changes` verdict on a defect case, so a model that found another real defect is visible next to the strict count.

## Pack the cases

The packs are not committed (2 MB of this repository's own code). Build them with the squad's `pack.mjs`, from a copy of the current `tools/squad/*.mjs` outside the checkout, with the case's head checked out:

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
