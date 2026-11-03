# 444: review fixes, chrome=0 panels and own-property guard

Rules: English only; edit only Files; preserve existing work; never rewrite or empty an existing test file, append cases. Write the minimum. Verify: run test on tests/embed.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read src/app/App.tsx (lines 74-95), src/app/embed.ts, tests/embed.test.ts.

Why: review of #444. With `&chrome=0` the issue wants only the tower, the live feed and the node panel; LayerNav, Legend, Controls, the hint line and TowerInfo still show. And `open('constructor')` passes the guard because `ws.towers[towerId]` reads through the prototype.

1. In src/app/App.tsx render `<LayerNav />`, `<Legend />`, `<Controls />`, the `<div className="hint">` line and `<TowerInfo />` only when `CHROME` is true (keep their existing conditions, add `CHROME &&`). Leave Inspector, NodeList, LiveFeed, Issues and PhoneTabs as they are.
2. In src/app/embed.ts line 18 replace `ws.towers[towerId]` with `Object.hasOwn(ws.towers, towerId)`.
Append to tests/embed.test.ts: with a workspace set, `embedApi().open('constructor')` and `open('__proto__')` leave `useStore.getState().stack` unchanged.
Files: src/app/App.tsx, src/app/embed.ts, tests/embed.test.ts
