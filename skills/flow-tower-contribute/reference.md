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
- [ ] Image metadata stripped and no real names or faces visible in screenshots.
- [ ] Commit author email is the GitHub noreply address (`git config user.email <id>+<login>@users.noreply.github.com`).
- [ ] No real names in commit messages, the issue or the PR body.
- [ ] No real SaaS tenant IDs or URLs, and no timestamps or log IDs that could be matched to a real system.

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
# 1. open the issue first and wait for the maintainer's go
gh issue create -R JamesMoriartyDecripto/flow-tower --template example.yml

# 2. fork and branch
gh repo fork JamesMoriartyDecripto/flow-tower --clone && cd flow-tower
git remote add upstream https://github.com/JamesMoriartyDecripto/flow-tower.git
git switch -c examples/<name>
cp -R <dir> examples/<name>
# add the row to examples/README.md
# add a line under [Unreleased] → Added in CHANGELOG.md
npm install && npm run check                 # includes tests/examples.test.ts
node bin/flow-tower.js check-example examples/<name>

# 3. commit with sign-off (DCO)
git add examples/<name> examples/README.md CHANGELOG.md
git commit -s -m "feat(examples): add <name>"
git push -u origin examples/<name>

# 4. PR; the body file starts from .github/pull_request_template.md
gh pr create -R JamesMoriartyDecripto/flow-tower --head <you>:examples/<name> \
  --title "feat(examples): add <name>" --body-file pr-body.md

# 5. review fixes: new commits on the same branch, then push
git push
```

## PR checklist

The PR body is the repo's `.github/pull_request_template.md`: fill every section and keep the "Example tower" block. Say that an AI agent helped.

Link the issue with `Fixes #<n>`. Rules: [CONTRIBUTING.md](../../CONTRIBUTING.md).
