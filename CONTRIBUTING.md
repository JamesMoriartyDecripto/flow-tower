# Contributing

Thanks for helping build Flow Tower.

## Setup

```bash
npm install
npm run dev        # library of every example, with live reload
npm run check      # typecheck + tests
npm run e2e        # Playwright sweep of every example tower (uses your installed Google Chrome)
```

## Guidelines

- **Small PRs**, one topic each. Branch from `main` (`feat/...`, `fix/...`). `main` is protected: no direct or force pushes, every change goes through a pull request that needs the CI check and a review by the maintainer (CODEOWNERS). Workflows on PRs from forks run after the maintainer approves them.
- **Schema changes**: edit `src/core/schema.ts`, then run `npm run schema` and commit `schema/flow-tower.schema.json`. Update `docs/schema.md`.
- **Tests**: core logic (parsing, resolution, validation) needs a test in `tests/`. Every example in `examples/` must load with zero errors and warnings.
- **Keep files under ~400 lines** and prefer plain functions over classes.
- **Changelog**: add a line under `[Unreleased]` in `CHANGELOG.md`.
- **Security**: the file API must stay read-only and confined to the tower root. Report vulnerabilities privately (see `SECURITY.md`).

## Project layout

See [docs/architecture.md](docs/architecture.md) for which file owns what. New example towers: follow the rules in [examples/README.md](examples/README.md).
