# Flow Tower: notes for Claude

3D tower visualizer for agentic systems. Read `NEXT.md` for the current handoff. GitHub issues are the source of truth for remaining work.

## Conventions

- English only, everywhere: code, docs, examples, commits.
- Never work on `main`. Use one branch per feature (`feat/…`, `fix/…`), stacked PRs when needed. **The user merges.**
- Commit and push after every completed piece of work, not at the end, so anything broken can be recovered.
- Update `CHANGELOG.md` under `[Unreleased]` (keepachangelog: Added / Changed / Fixed / Security).
- Before using an external library API, check current docs (Context7) — versions are recent: React 19, r3f 9, drei 10, three 0.186, Vite 8, zod 4, TypeScript 7.
- Keep files under ~400 lines; plain functions over classes; comments explain *why*.
- After a schema change: `npm run schema`, then update `docs/schema.md`.
- Every tower in `examples/` must load with 0 errors and 0 warnings (`tests/examples.test.ts`). Presets must be researched and realistic, with real files behind every reference.
- Verify UI changes in a browser (Playwright screenshots), not only via typecheck.
- After every push, check CI (`gh pr checks` / `gh run list`): local runs can pass on files that git ignores.

## Gotchas

- `.gitignore` has `*.log` with an exception for `examples/**/*.log` (log fixtures referenced by the towers). A test fails if any file under `examples/` is git-ignored.

- `/api/events` must answer **204 with an empty body**: Claude Code HTTP hooks read a JSON response body as a hook decision.
- Rendering is batched per layer (instanced meshes, LineSegments2, troika `BatchedText`). Do not reintroduce per-node meshes or `<Text>`: 55 nodes dropped to 14 FPS that way.
- In one-line YAML maps, quote values containing commas.
- Some environments block shell commands containing the text `.env` (even `process.env`): use `import { env } from 'node:process'` and file-edit tools.
- zsh does not word-split unquoted `$var`; use `${=var}`.

## Commands

`npm run dev` · `npm run check` · `npm run simulate -- <project>` · `npm run stress -- <layers> <nodes>` · `node bin/flow-tower.js validate <path> --json`
