# 378-01: panel-corners picks the tower with the largest layer

Rules: English only; edit only Files; change only the fixture choice. Verify: typecheck (npm run typecheck); the full check runs after finish. Do not run Playwright.
Read e2e/panel-corners.spec.ts and e2e/fixtures.ts (what ws holds).

Why: line 10 reads exactly `const ID = ws.projects.find((p) => p.startsWith('dev-squad/'))!;`. Since the dev-squad example shrank (#355), its largest layer no longer overflows the 600px window, so the `overflows` expectation fails.
1. Choose ID as the project in ws.projects whose tower (ws.towers[id]) has the layer with the most nodes. Keep the rest of the test unchanged. Plain JavaScript inside page.evaluate stays untouched.
Files: e2e/panel-corners.spec.ts
