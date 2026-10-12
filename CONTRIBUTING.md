# Contributing

Thanks for helping build Flow Tower. This file is the one source of truth for how to contribute.

## Before you start

- Read and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Questions and ideas go to [GitHub Discussions](https://github.com/JamesMoriartyDecripto/flow-tower/discussions), not issues.
- **Issue first:** anything beyond a typo starts with an issue. Use the issue forms, so the approach is agreed before code is written.

## Setup

```bash
npm install
npm run dev        # examples gallery, with live reload
npm run check      # typecheck + tests
npm run e2e        # Playwright sweep of every example tower (uses your installed Google Chrome)
```

## Workflow

- Fork the repo, then clone your fork:
  ```bash
  git remote add upstream https://github.com/JamesMoriartyDecripto/flow-tower.git
  ```
- One branch per issue, created from an up-to-date `main`.
- Branch prefixes: `feat/`, `fix/`, `docs/`, `chore/`, `examples/` (a new example tower).
- Small PRs, one topic each.
- Before you open the PR, sync with upstream: `git fetch upstream && git rebase upstream/main`.
- Open a draft PR early if you want feedback.
- Fill in the PR template and link the issue with `Fixes #<n>`.

## Commits

- Use [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/): `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`. A scope is optional, for example `feat(voice):`.
- **Sign-off (DCO):** every commit must carry `Signed-off-by: Name <email>`, added with `git commit -s`. The sign-off certifies the [Developer Certificate of Origin](https://developercertificate.org/).
- CI rejects a PR with an unsigned commit. To fix it:
  - Last commit only: `git commit --amend -s`.
  - All commits: `git rebase --signoff upstream/main`.
  - Then push. A force-push is fine on your own fork branch, never on `main`.
- To keep your email private, use your GitHub noreply address as the commit email.

## Review

- Answer every review comment.
- Push fixes as new commits on the same branch.
- Mark a thread resolved only when it is fixed.
- The maintainer merges. `main` is protected: no direct or force pushes.

## Licence of contributions

- Inbound = outbound: your contribution is released under the repo's [MIT licence](LICENSE).
- You must have the right to submit it.
- Credit third-party sources in the README's `## Sources` section.
- No proprietary text or code.
- Sample data is synthetic. Never use real customer data.

## AI-assisted contributions

AI-assisted contributions are welcome, with three rules:

- Say so in the PR. The template has a box for it.
- You, the human submitter, are responsible for every line. You must have reviewed and run it.
- No unverified AI-generated security reports. Verify and reproduce the issue before you report it.

## Guidelines

- **Schema changes**: edit `src/core/schema.ts`, then run `npm run schema` and commit `schema/flow-tower.schema.json`. Update `docs/schema.md`.
- **Tests**: core logic (parsing, resolution, validation) needs a test in `tests/`. Every example in `examples/` must load with zero errors and warnings.
- **Keep files under ~400 lines** and prefer plain functions over classes.
- **Changelog**: add a line under `[Unreleased]` in `CHANGELOG.md`, in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style.
- **Security**: the file API must stay read-only and confined to the tower root. Report vulnerabilities privately (see `SECURITY.md`).
- **Versioning**: the project follows [SemVer](https://semver.org). A schema change that breaks existing tower files is a major version.

## Project layout

See [docs/architecture.md](docs/architecture.md) for which file owns what. New example towers: follow the rules in [examples/README.md](examples/README.md) and the `flow-tower-contribute` skill (`skills/flow-tower-contribute/SKILL.md`).
