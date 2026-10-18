---
id: hub-pause-415-v2
category: planner
check: regex
rubric: true
steps: 1
---
# Plan the fix for a real bug (v2)

Replaces `hub-pause-415`, whose pattern missed a correct root cause written with backticks (wrong key, retired 2026-10-16). From real work: Flow Tower issue #206. Hub › Admin's Pause button answered 415; the fix (commit db77b2f) changed the client so every admin call sends JSON, and kept the server's check.

## Prompt

You are the architect of a dev squad: you write the plan a coder follows. You do not write the code.

Bug report: on the hub, Admin › Senders › "Pause" (and "Resume") does nothing; the browser console shows `POST /api/hub/admin/senders/bob-laptop/pause 415 (Unsupported Media Type)`, body `{"error":"body must be application/json"}`. The CLI `flow-tower token pause bob-laptop` works.

Code (TypeScript):

`src/app/hud/HubAdmin.tsx`, the button:
    <button onClick={() => void change('POST', `/senders/${encodeURIComponent(s.id)}/${s.paused ? 'resume' : 'pause'}`)}>

`src/app/hud/hubAdminApi.ts`:
    export async function callAdmin<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
      const res = await fetch(`/api/hub/admin${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      ...
    }

`src/server/guard.ts`:
    // Requiring application/json on every state-changing admin route means a cross-site HTML form
    // (which can only send form or text bodies) cannot trigger an admin action.
    export const isJson = (req) => (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/json';

`src/server/hub-admin.ts`, `senderAction` (pause, resume, revoke):
    if (!guard(req, res, 'POST')) return;
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    ...

Write the plan as a numbered list (at most 8 steps): the root cause in one sentence, which file(s) change and how, what must NOT change and why, and the test that proves the fix.

## Expected

```regex
hubAdminApi
Content-Type|application/json
(no|without|undefined|missing|empty) `?body|`?body`? (is|was) `?undefined|body === undefined|without a body
test
```

Rubric (blind scorer, 0-10):
- 3 points: root cause: `callAdmin` omits the JSON Content-Type when there is no body, and the server requires JSON on every admin POST.
- 3 points: the fix in `hubAdminApi.ts`: always send JSON (e.g. `{}` when no body) so every state-changing call has the header; or the button sends `{}`. Either is fine; the client changes.
- 2 points: keeps the server's `isJson` check, with the reason (it blocks cross-site form posts / CSRF).
- 2 points: a test that a POST with no body sends `application/json` (unit test on `callAdmin`) or an e2e click on Pause that gets 204.
