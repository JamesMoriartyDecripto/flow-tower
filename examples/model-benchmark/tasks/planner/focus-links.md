---
id: focus-links
category: planner
check: command
command: focus-links.check.mjs
tools: read_file
files: fixtures/focus-links/linkFocus.ts.txt, fixtures/focus-links/Links.tsx.txt, fixtures/focus-links/link-focus.test.ts.txt, fixtures/focus-links/Tower.excerpt.tsx.txt
steps: 8
---
# Plan the focus-mode link change

From real work: Flow Tower issue #360, fixed by PR #361 (2026-10-31). The fixtures are the files as they were before the fix.

## Prompt

You are the lead of a coding squad. Plan the change for this GitHub issue in the Flow Tower repository, a 3D viewer built with react-three-fiber. Read the files you need with the read_file tool: `src/app/scene/linkFocus.ts`, `src/app/scene/Links.tsx`, `tests/link-focus.test.ts`, and an excerpt of `src/app/scene/Tower.tsx`. Each fixture file ends in `.txt`; plan with the real paths (without `.txt`).

Issue text:

> With a layer focused, selecting a node still draws its cross-layer links (and those of its related nodes) at full strength. They run up to layers the focus camera hides, so the user sees lines going nowhere.
> Decision: in focus mode no cross-layer link is drawn, highlighted or not. The node panel already lists the destinations. Overview and map view stay as they are. Rendering stays batched (no per-link meshes).

Each step is done by a cheap coder model, so a step has at most 3 items, names every file it touches, and leaves the project's check green. Answer with one fenced js block and nothing else:

```js
export default {
  criteria: ['what must be true when the change is done', ...],
  steps: [{ title: '...', items: ['...'], files: ['path/to/file'] }, ...],
};
```

## Expected

A small change: one step was enough. `linkFocusFade` in `src/app/scene/linkFocus.ts` returns 0 whenever a layer is focused and loses its `highlighted` parameter, `Links.tsx` updates its one call, and `tests/link-focus.test.ts` follows. A plan passes when it names the helper or `Links.tsx`, names `tests/link-focus.test.ts`, and has at most 4 steps of 1-3 items. Over-planning (new components, per-link meshes, Tower.tsx rewrites) is what this task catches.
