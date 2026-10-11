# Contribute a tower: reference

Loaded on demand by [SKILL.md](SKILL.md).

## Anonymisation checklist

`check-example` scans for personal data, but it cannot know your customers. Check by hand too:

- [ ] No personal paths (`/Users/<name>`, `/home/<name>`, `C:\Users\…`): use paths relative to the folder.
- [ ] No host names, machine names, IPs, internal URLs or tailnet names: `hub.example.com`, `10.0.0.x` style placeholders.
- [ ] No emails, phone numbers, user names: `ops@example.com`.
- [ ] No tokens, API keys, passwords, dotenv values, even revoked ones: `<YOUR_API_KEY>`.
- [ ] Real company, customer, product and people names replaced with realistic placeholders (the same placeholder everywhere).
- [ ] Logs, transcripts and sample data rewritten, not redacted halfway; no real prices, contracts or invoices.
- [ ] Numbers that are not sourced are labelled illustrative.
- [ ] Git history of the folder is not part of the PR (copy the files into the fork; do not move a private repo's history).

## Self-contained

- `root:` is `.` or omitted; no `../` reference leaves the folder.
- Every `files:`, `from:`, `log:` and nested `tower:` points at a file inside the folder: add short realistic prompts, configs and scripts rather than dropping references.
- No file git ignores (`*.log` is allowed under `examples/`, `.claude/settings.local.json` is not), no file over 1 MB.

## README template

```markdown
# <Name>

<One paragraph: the system it maps and the pattern it is a model for.>

## What it shows

- <layer or pattern 1>
- <layer or pattern 2>

## Run it

    flow-tower examples/<name>                          # open it
    npm run simulate -- <name>                          # live events, from the clone

## Notes

Numbers marked *illustrative* are not measured.

## Sources

- [<Doc or paper>](https://…): <what it supports>
```

## Section guide

Sections of `examples/README.md`; one row: folder link, layer count, "Use it as a model for".

| Section | For |
|---|---|
| Starters | One short file, the smallest model of a pattern (goes under `starters/`) |
| Agent systems | A real multi-agent system, one per architecture or domain |
| Operations and team hub | Running Flow Tower for a team, deploying or measuring models |
| Beyond agents | Notes and playbooks: towers of knowledge |

Never "Flow Tower's own towers (dogfood)": that is for towers of this repo.

## Commands

Run from a folder outside other repos. `<you>` is the user's GitHub login.

```bash
gh repo fork JamesMoriartyDecripto/flow-tower --clone && cd flow-tower
git switch -c examples/<name>
cp -R <dir> examples/<name>
# add the row to examples/README.md
npm install && npm run check                 # includes tests/examples.test.ts
node bin/flow-tower.js check-example examples/<name>
git add examples/<name> examples/README.md
git commit -m "examples: add <name>"
git push -u origin examples/<name>
gh pr create -R JamesMoriartyDecripto/flow-tower --head <you>:examples/<name> \
  --title "examples: add <name>" --body-file pr-body.md
```

## PR checklist

Copy into `pr-body.md`:

```markdown
Adds `examples/<name>`: <one line>.

- [ ] `flow-tower check-example examples/<name>` passes
- [ ] `npm run check` green (tests/examples.test.ts: 0 errors, 0 warnings)
- [ ] Anonymised: no personal paths, hosts, IPs, emails, tokens, keys; real company/customer data replaced
- [ ] Self-contained: no `root: ../..`, every referenced file in the folder
- [ ] README: what it shows, how to run it, Sources; illustrative numbers labelled
- [ ] Row added to the right section of examples/README.md
- [ ] English only
```
