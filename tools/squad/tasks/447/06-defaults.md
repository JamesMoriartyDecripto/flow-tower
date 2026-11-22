# 447-06: the measured model defaults

Rules: English only; edit only Files; write the minimum; comments explain why. Whenever a step changes a default, update the tests that assert the old value. Verify: run test on tests/squad-config.test.ts, then on tests/squad-roles.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Skills: untyped-mjs
Read tools/squad/config.mjs (DEFAULTS, modelFor), tests/squad-config.test.ts (around line 100), tests/squad-roles.test.ts (lines 60-80), examples/dev-squad/squad.example.json, examples/dev-squad/dev-squad.tower.yaml (the `agents:` block: it already shows the target).

Why: issue #447 measured every role on real pull requests of this repository. The maintainer approved the new defaults. GLM 5.3 Flash as reviewer saw 4 of 12 kept defects and asked for changes on 1 of 12 defective heads; DeepSeek 4.1 Flash as security failed 3 of 16 runs with empty answers. MiniMax M3.1 Flash saw 7 of 12 (reviewer) and 6 of 12 (security) and raised no critical or high finding on a clean head. Gemini 4 Carbon judged 18 of 18 keep/drop sets right, Sonnet 5.5 15 of 18.

1. In tools/squad/config.mjs `DEFAULTS.models`: `reviewer: 'minimax/minimax-m3.1-flash'`, `security: 'minimax/minimax-m3.1-flash'`, `'lead-judge': 'google/gemini-4-carbon'`, and add `researcher: 'z-ai/glm-5.3-flash'` and `verifier: 'z-ai/glm-5.3-flash'` so those two keep the model they ran on until now instead of following the reviewer. coder and architect stay. Replace the comment above DEFAULTS with one that says where the numbers come from: the 2026-11-22 benchmark of #447 (four real pull requests, examples/model-benchmark/results/2026-11-22-squad-roles.md) for reviewer, security and lead-judge, and #362 for the architect.
2. In examples/dev-squad/squad.example.json set the same reviewer and security values.
3. tests/squad-config.test.ts: the defaults test expects the new values, its title names minimax for the reviewer. tests/squad-roles.test.ts: the read-only graders test checks that `researcher` and `verifier` use their own defaults (`z-ai/glm-5.3-flash`), and that with `models: { reviewer: 'x/rev' }` and no researcher entry, `modelFor` gives `researcher` the value `x/rev` (the family fallback still works). The architect and lead-judge test expects `openai/gpt-6.1-terra` and `google/gemini-4-carbon` and cites #447.

Files: tools/squad/config.mjs, examples/dev-squad/squad.example.json, tests/squad-config.test.ts, tests/squad-roles.test.ts
