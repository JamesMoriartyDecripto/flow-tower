# Blind rubric sheet

Score each answer 0-10 against its task rubric and rubric.md. You do not know which model wrote it; do not try to guess.

## B001 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
One real defect: lines 20–24, `push` changes the existing state in place and returns the same object `s`. Plain zustand (no immer) only notifies listeners when `set` gets a new state object (!Object.is(next, prev)), so subscribers are never called and the 3D view never re-renders on live events. Selectors on `events`/`active` would also get back the same references, so useSyncExternalStore sees no change. Fix: return new objects, e.g. `const events = [...s.events, e]; if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS); let active = s.active; if (e.kind==='start') active = {...active, [e.node]: (active[e.node] ?? 0) + 1}; else if (e.kind==='end') active = {...active, [e.node]: Math.max(0, (active[e.node] ?? 1) - 1)}; return { events, active };`. Alternatively, wrap the store in zustand's immer middleware. Everything else is fine: `clear` already creates new objects, and the 500-event cap and the floor at 0 for counts work correctly.
````

## B002 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
I found one real defect. It breaks all live updates.

**1. Lines 19–24: the state is changed in place, so the view never re-renders.**
- **What goes wrong:** The plain `create` call has no immer middleware, so `s` is the actual current state object. The code changes `s.events` and `s.active` directly and then returns that same `s`. Zustand only notifies subscribers when the new state is a different object from the old one (it uses `Object.is`). Here it is the same object, so `push` notifies no one. Even if something else triggered a render, a selector like `useLive(s => s.events)` or `s.active` would get back the same array or object it had before. React would see nothing as changed. Result: the 3D view stays frozen while the data changes underneath it. Old snapshots are also altered after the fact, because they share the same array and object.
- **Fix:** Build new objects instead of changing the old ones:
  ```ts
  push: (e) =>
    set((s) => {
      const events = [...s.events, e].slice(-MAX_EVENTS);
      let active = s.active;
      if (e.kind === 'start') active = { ...active, [e.node]: (active[e.node] ?? 0) + 1 };
      else if (e.kind === 'end') active = { ...active, [e.node]: Math.max(0, (active[e.node] ?? 0) - 1) };
      return { events, active };
    }),
  ```
  The other option is to wrap the store in zustand's `immer` middleware. Then the in-place changes would be correct, as long as you drop the `return s`.

**2. Line 23 (minor): finished nodes are never removed from `active`.**
- **What goes wrong:** When a node's count drops to 0, its key stays in `active` with the value 0. Over a long session the object keeps growing. Any code that treats "key exists" as "node is running" will be wrong.
- **Fix:** When the count reaches 0, delete the key instead of storing 0.

`clear` (line 26) is fine as written.
````

## B003 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
1. Lines 24–25 (high): Claude Code reads a JSON response from an HTTP hook as the hook's decision. This route always returns {"ok":true,"accepted":N}, and none of those fields is valid hook output (`ok` belongs to prompt-style hooks, `accepted` means nothing). So every PreToolUse/PostToolUse call either fails output validation (a hook error on every tool call) or has its decision misread. Fix: send no body to hook callers (204), or `{}` for "no decision". Return the count only when asked (e.g. ?verbose=1 or an Accept header), or in a header such as X-Accepted-Count.

2. Lines 21–22 (medium): if parseEvents or publish throws, the async handler rejects and no response is sent. The hook hangs until Claude Code's timeout, stalling the tool call, and the rejection may go unhandled. Fix: wrap the handler in try/catch. Reply 400 with no body on a parse error and 500 on other errors, so Claude Code sees a non-blocking hook failure.

3. Lines 16–18 (low): body.length counts UTF-16 characters, not bytes, and adding chunks to a string can corrupt a multi-byte character split across chunks. After the 413 reply the request stream is never closed, so the client may keep uploading. Fix: collect Buffers, track byteLength, join with Buffer.concat(chunks).toString('utf8'), and call req.destroy() (or send Connection: close) after the 413.
````

## B004 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect (line 19–24, `push`): the state is mutated in place and the same object is returned, so subscribers never re-render.**

- **What goes wrong:** `s.events.push`, `splice` and `s.active[...] =` all modify the existing state. `return s` then hands zustand the same reference. Zustand's `set` merges with `Object.assign({}, state, nextState)` only if `nextState !== state`. With the same reference it skips the update and notifies no one. Even if listeners were notified, `events` and `active` keep the same references. Selectors like `useLive(s => s.events)` or `s => s.active` therefore compare equal under `Object.is`, and the 3D view doesn't re-render when events arrive. It would only update after `clear()`, which does create new objects.
- **Fix:** return new objects instead of mutating.

```ts
push: (e) =>
  set((s) => {
    const events = [...s.events, e].slice(-MAX_EVENTS);
    const active = { ...s.active };
    if (e.kind === 'start') active[e.node] = (active[e.node] ?? 0) + 1;
    if (e.kind === 'end') active[e.node] = Math.max(0, (active[e.node] ?? 1) - 1);
    return { events, active };
  }),
```

I found no other real defects.
````

## B005 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect (high severity): `push` mutates state in place and returns the same state object, so subscribers don't re-render.**

- **Line 19–24:** `s.events.push(e)`, the `splice`, and the `s.active[...]` writes all mutate the existing state. The function then returns `s`, the same reference. Zustand compares the returned state with `Object.is` and sees no change, so it doesn't notify subscribers. The `useSyncExternalStore` hooks that read `events` or `active` keep their old snapshot. The 3D view won't re-render when live events arrive, even though the store contents change. It may only update later, when some unrelated state change happens to trigger a render. Any component that reads the same arrays by reference also sees stale data.

  **Fix:** build new objects and return a fresh partial state:

  ```ts
  push: (e) =>
    set((s) => {
      const events = [...s.events, e];
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
      const active = { ...s.active };
      if (e.kind === 'start') active[e.node] = (active[e.node] ?? 0) + 1;
      if (e.kind === 'end') active[e.node] = Math.max(0, (active[e.node] ?? 1) - 1);
      return { events, active };
    }),
  ```

  Copying `events` on each push is O(n) with n ≤ 500, which is cheap. If that cost matters, a bounded ring buffer with a new wrapper array each time also works.

No other real defects. The `clear` action (line 26) already returns new objects, the trim logic on line 21 is correct, and the `?? 1` fallback on line 23 yields 0 for an unmatched `end`, which is acceptable.
````

## B006 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
Line 20: `s.events.push(e);` and Line 21: `if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);`
What goes wrong at runtime: Zustand's `set` function expects immutable updates when using a functional updater. Directly mutating `s.events` with `push` and `splice` can lead to components not re-rendering reliably, as the array reference itself doesn't change until `splice` is called, and `useSyncExternalStore` often relies on reference equality.
The fix: Create a new array for `events` instead of mutating the existing one.

```typescript
// ...
push: (e) =>
  set((s) => {
    let newEvents = [...s.events, e]; // Create a new array
    if (newEvents.length > MAX_EVENTS) {
      newEvents = newEvents.slice(newEvents.length - MAX_EVENTS); // Create a new array from slice
    }
    // ...
    return { ...s, events: newEvents, active: newActive }; // Return new state object
  }),
// ...
```

Line 22: `if (e.kind === 'start') s.active[e.node] = (s.active[e.node] ?? 0) + 1;` and Line 23: `if (e.kind === 'end') s.active[e.node] = Math.max(0, (s.active[e.node] ?? 1) - 1);`
What goes wrong at runtime: Similar to `events`, directly mutating `s.active` (an object) can prevent components from re-rendering correctly, as the object reference remains the same.
The fix: Create a new `active` object with the updated property.

```typescript
// ...
push: (e) =>
  set((s) => {
    let newEvents = [...s.events, e];
    if (newEvents.length > MAX_EVENTS) {
      newEvents = newEvents.slice(newEvents.length - MAX_EVENTS);
    }

    const newActive = { ...s.active }; // Create a new active object
    if (e.kind === 'start') {
      newActive[e.node] = (newActive[e.node] ?? 0) + 1;
    }
    if (e.kind === 'end') {
      newActive[e.node] = Math.max(0, (newActive[e.node] ?? 1) - 1);
    }
    return { ...s, events: newEvents, active: newActive }; // Return new state object with new active object
  }),
// ...
```
````

## B007 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect (high severity): `push` mutates state in place and returns the same object, so the 3D view will not re-render on live events.**

- **Line 19–24:** `s.events.push(e)`, the `splice`, and the `s.active[...]` writes all mutate the existing state. `return s` hands zustand the same object reference. Zustand only notifies subscribers when the state reference changes (`Object.is`), so `useSyncExternalStore` never sees a change. Components selecting `events` or `active` keep the old array reference and skip re-rendering. The store still holds the data, so it looks correct when read directly, but the UI stays stale until something else triggers a render, such as a `clear()`, which does create new objects.
- **Fix:** Return new references for everything that changes:
  ```ts
  push: (e) =>
    set((s) => {
      const events = s.events.length >= MAX_EVENTS
        ? [...s.events.slice(s.events.length - MAX_EVENTS + 1), e]
        : [...s.events, e];
      const active = { ...s.active };
      if (e.kind === 'start') active[e.node] = (active[e.node] ?? 0) + 1;
      if (e.kind === 'end') active[e.node] = Math.max(0, (active[e.node] ?? 1) - 1);
      return { events, active };
    }),
  ```
  Copying on every push is O(n) for up to 500 events, which is acceptable. If event rate is high, batch pushes.

No other real defects. The `end` branch's `?? 1` default and `Math.max(0, …)` correctly handle an end without a matching start, and `clear` already creates new objects.
````

## B008 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
Defects, most severe first:

1. **Lines 24–25: the response body is read as a hook decision.** Claude Code parses any JSON body returned with a 2xx status as the hook's output. The body `{ok:true, accepted:N}` isn't a valid decision, and it may be rejected or misread. Because this endpoint serves PreToolUse and similar hooks, that can break or confuse tool-call gating.
   Fix: return an empty body, either `204` or `200` with no content. Alternatively, return `{}` or a deliberately valid hook output, such as `{"continue":true}`. Drop the `accepted` count from the response and log it server-side instead.

2. **Line 21: `parseEvents(body)` has no error handling.** Malformed JSON or an unexpected payload makes `parseEvents` throw, or it may return a non-array. The async handler then rejects, which is likely an unhandled rejection. The request hangs or the connection drops with no response. Claude Code treats a non-2xx response as a non-blocking error, but a hang or crash is worse.
   Fix: wrap the call in try/catch. On failure, respond with `400` (or a quiet `200`/`204`) and return. Also wrap `publish` so one failing subscriber doesn't fail the whole request.

3. **Lines 14–19: the size check and the early 413 return.**
   - `body += chunk` concatenates Buffers as strings, which can corrupt multibyte UTF-8 characters that are split across chunk boundaries. Fix: collect Buffers, or call `req.setEncoding('utf8')`.
   - `body.length` counts characters, not bytes, so the limit isn't enforced precisely.
   - Returning at line 18 without destroying the request leaves the rest of the upload unread. Fix: send `Connection: close` or call `req.destroy()`.
````

## B009 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
I found three real defects, most severe first.

1. **Lines 24–25: the reply is read as a hook decision.** Claude Code treats a JSON body from an HTTP hook as that hook's decision output. `{ok: true, accepted: n}` isn't a valid decision, so on every PreToolUse/PostToolUse call Claude Code either rejects it as malformed output (with warnings or errors) or reads it in some way you didn't intend. The "accepted count" for scripts ends up inside the agent's control flow.
   - **Fix:** send hook callers an empty success reply, e.g. `res.writeHead(204).end()` or a 200 with no body. If scripts need the count, return it only when they ask for it, such as with `?verbose=1` or a custom request header. Don't return JSON by default.

2. **Line 21: a bad body leaves the request hanging.** If `parseEvents` throws on malformed JSON, the async handler rejects and no response is ever sent. The hook then waits until it times out, which stalls the tool call. It may also cause an unhandled rejection in the dev server.
   - **Fix:** wrap the parse and publish steps in `try/catch` and reply `400` with no JSON decision body. Also catch errors from `publish` so one bad event can't drop the response.

3. **Lines 14–19: chunks are joined as text, and the size cap counts characters.** Converting each Buffer to a string separately breaks any multi-byte UTF-8 character that falls across a chunk boundary, which corrupts the payload. `body.length` counts UTF-16 characters, not bytes, so the 1 MB cap isn't enforced exactly. Also, after sending 413 the code returns without consuming the rest of the request, so the client may see a reset connection.
   - **Fix:** collect the Buffers and add up `chunk.length` in bytes. Then use `Buffer.concat(chunks).toString('utf8')`. On 413, send `Connection: close` and call `req.destroy()`, or keep reading the rest of the request without storing it.
````

## B010 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect 1 (lines 20–24, severe): `push` mutates state in place and returns the same object.**
- **What goes wrong:** `set` is given the same `s` object that is already in the store. Zustand checks `Object.is(next, state)` and skips notifying subscribers. `s.events` and `s.active` also keep the same references. As a result, components using `useLive(s => s.events)` or `useLive(s => s.active)` never re-render when events arrive. The 3D view stays stale until something unrelated, such as `clear`, replaces those references. Selectors that return memoized or derived values can also return stale data.
- **Fix:** return new references instead of mutating:
```ts
push: (e) => set((s) => {
  const events = [...s.events, e].slice(-MAX_EVENTS);
  const active = { ...s.active };
  if (e.kind === 'start') active[e.node] = (active[e.node] ?? 0) + 1;
  else if (e.kind === 'end') active[e.node] = Math.max(0, (active[e.node] ?? 1) - 1);
  return { events, active };
}),
```

**Defect 2 (line 23, minor): a stray `end` for an unseen node writes an entry of 0.**
- **What goes wrong:** an `end` event for a node with no `start` creates `active[node] = 0`. Entries are never removed, so the `active` map grows without bound over a long session.
- **Fix:** delete the key when the count reaches 0.

Line 26 (`clear`) is fine.
````

## B011 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
I found one real defect, and it's severe. The rest of the file is fine.

**1. Lines 20–24: `push` changes the state in place and returns the same object, so the view never re-renders.**
- **What goes wrong:** Zustand only notifies listeners when the new state is a different object from the old one (it checks with `Object.is`). `push` changes `s.events` and `s.active` directly and then returns `s` itself, so the check sees no change. No subscriber is notified, and the 3D view never updates on live events. Even if something else triggers a notify, selectors like `s => s.events` or `s => s.active` get back the same array and object references. `useSyncExternalStore` would treat them as unchanged and skip the re-render. The data is also changed under any snapshot a component is already holding.
- **Fix:** build new objects instead of changing the old ones:
  ```ts
  push: (e) =>
    set((s) => {
      const events = [...s.events, e];
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
      let active = s.active;
      if (e.kind === 'start') active = { ...active, [e.node]: (active[e.node] ?? 0) + 1 };
      else if (e.kind === 'end') active = { ...active, [e.node]: Math.max(0, (active[e.node] ?? 0) - 1) };
      return { events, active };
    }),
  ```
  Or wrap the store creator in zustand's `immer` middleware, which makes the existing in-place style work. If you do that, drop `return s`.

`clear` (line 26) is correct because it creates new objects.
````

## B012 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
### Defect 1: In-place state mutation breaks change detection and component re-rendering

- **Line:** 19–25 (`push: (e) => set((s) => { ... return s; })`)
- **What goes wrong at runtime:** 
  Zustand performs an `Object.is` equality check between the previous state and next state. Mutating `s.events` and `s.active` in place and returning `s` causes Zustand (and React's `useSyncExternalStore`) to see `Object.is(prev, next) === true`. As a result, listeners are not notified and components subscribed to `useLive` (or selectors selecting `events`/`active`) will not re-render when events arrive.
- **Fix:** Return new object and array references immutably instead of mutating the existing state:
  ```ts
  push: (e) =>
    set((s) => {
      const nextEvents = [...s.events, e];
      if (nextEvents.length > MAX_EVENTS) {
        nextEvents.splice(0, nextEvents.length - MAX_EVENTS);
      }
      const nextActive = { ...s.active };
      if (e.kind === 'start') {
        nextActive[e.node] = (nextActive[e.node] ?? 0) + 1;
      } else if (e.kind === 'end') {
        nextActive[e.node] = Math.max(0, (nextActive[e.node] ?? 1) - 1);
      }
      return { events: nextEvents, active: nextActive };
    }),
  ```
````

## B013 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
I found three defects, most severe first.

1. **Lines 24-25: the hook response body is misread as a decision.** Claude Code parses any JSON body from a 2xx hook response as the hook's output. The body `{"ok":true,"accepted":N}` isn't a valid decision. At best Claude Code ignores the unknown fields. At worst it reports a hook output validation error on every PreToolUse and PostToolUse call. A future field such as `decision` or `continue` would also change Claude's behavior without anyone intending it.
   **Fix:** return an empty 200 or 204 with no body, as in `res.writeHead(204).end()`. If the sender needs a count, return it in a header such as `X-Accepted`, or send JSON only to non-hook callers. If you want to allow the tool call explicitly, return `{}` or a proper `hookSpecificOutput` object.

2. **Line 21: `parseEvents` is not guarded.** If it throws on malformed JSON, the async handler rejects. That leaves an unhandled rejection and a request that never gets a response, or crashes the dev server. A hook that gets a non-2xx response or times out is non-blocking in Claude Code, but a hung connection still stalls the hook until it times out. A throwing `publish` on line 22 has the same effect.
   **Fix:** wrap both calls in try/catch. On a parse error return 400. On a publish error return 500, or return 200 with an empty body so the hook isn't affected.

3. **Lines 14-19: the body size check is wrong.** `body += chunk` converts Buffers to strings. A multi-byte character split across a chunk boundary is corrupted. `body.length` counts UTF-16 characters, not bytes, so the 1 MB limit isn't enforced exactly. After the 413 on line 17 the code returns without consuming or destroying the request, so the client may keep sending.
   **Fix:** collect the Buffers, sum `chunk.length`, and decode once with `Buffer.concat(chunks).toString('utf8')`. On overflow, send the response with `Connection: close` and call `req.destroy()`.
````

## B014 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
### Defects

**1. Line 24-25**
- **What goes wrong at runtime:** Claude Code interprets any JSON response from an HTTP hook as a hook decision object controlling execution (e.g. `decision: "approve" | "block"`, `action`, etc., or structured output for `PreToolUse`/`PostToolUse`). Returning `{ ok: true, accepted: events.length }` sends an unrecognized/invalid hook decision schema, which can cause Claude Code hook evaluation to fail or misbehave. For a passive event listener / notification hook, an empty body (or HTTP 204 No Content / empty JSON object `{}` / proper hook decision response) should be returned instead of arbitrary JSON metadata.
- **Fix:** Return an empty response (such as HTTP 204 No Content) or an empty body rather than JSON containing `{ ok: true, accepted: ... }`:
  ```ts
  res.writeHead(204).end();
  ```
  or, if keeping 200, return empty body or `{}`:
  ```ts
  res.writeHead(200).end();
  ```

**2. Line 13-15**
- **What goes wrong at runtime:** `req` streams binary `Buffer` chunks. Concatenating raw buffer chunks to a string via `body += chunk` converts buffers using the default encoding per chunk. If a multi-byte UTF-8 character falls across a chunk boundary, it will be split and corrupted into replacement characters (``), corrupting event payloads passed to `parseEvents`.
- **Fix:** Collect chunks into an array and decode with UTF-8 or use a `StringDecoder`:
  ```ts
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buf.length;
    if (length > MAX_BODY) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  ```
````

## B015 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
### Defect 1: JSON response body conflicts with Claude Code hook decision protocol

- **Line:** 24–25
- **What goes wrong at runtime:** 
  Claude Code inspects the JSON response body of HTTP hooks to determine hook decisions (e.g., control flow such as `continue: true/false`, tool-use approvals, or modifying input/output). Returning an arbitrary JSON payload (`{"ok": true, "accepted": ...}`) causes Claude Code to interpret `{ ok: true, accepted: ... }` as an unrecognized or malformed hook decision object, which can cause hook processing errors or block execution. For non-decision-making or purely observational/logging hooks, Claude Code expects an empty response (or a 204 No Content / valid hook response schema).
- **Fix:** Return an empty response with HTTP status 204 (No Content) instead of a JSON body:
  ```ts
  res.writeHead(204).end();
  ```

---

### Defect 2: Unhandled JSON parsing errors cause an unhandled rejection / 500 crash

- **Line:** 21
- **What goes wrong at runtime:** 
  If `body` is malformed JSON or empty, `parseEvents(body)` will throw an uncaught exception (e.g. `SyntaxError`). Because `handleEvents` is an `async` function and there is no `try...catch`, the promise rejects without sending an HTTP response to the client, hanging the hook request until timeout and potentially crashing the Node.js process if unhandled rejections are fatal.
- **Fix:** Wrap `parseEvents(body)` in a `try...catch` block and return an HTTP 400 Bad Request if parsing fails:
  ```ts
  let events;
  try {
    events = parseEvents(body);
  } catch {
    res.writeHead(400).end();
    return;
  }
  ```
````

## B016 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
I found three real defects in `fixtures/events-route.ts`, most severe first. The first depends on how Claude Code reads hook responses, which I took from your context and did not check against its docs.

1. **Lines 24–25: the reply body breaks hooks.** Every successful POST gets back `{"ok":true,"accepted":N}` as JSON. Claude Code treats a JSON reply as the hook's decision, so every PreToolUse and PostToolUse call gets this object back as its decision. At best the fields are ignored as unknown. At worst the reply fails schema validation and Claude Code reports a hook error on every tool call. It could also be misread as a decision, which would change what the hook allows or blocks.
   - **Fix:** for hook traffic, send `res.writeHead(204).end()` with no body, or an empty 200 with no JSON content type. If your scripts need the count, return it only when they opt in, for example with a `?verbose=1` query parameter or a custom header. Hook calls should never get it.

2. **Line 21: bad input leaves the request hanging.** If `parseEvents` throws on malformed JSON, the async handler's promise rejects. Nothing sends a response, so the client waits until it times out, and the rejection may go unhandled. For a hook, that means a stalled tool call followed by a hook error.
   - **Fix:** wrap the parse and publish steps in `try/catch` and return `400` on failure, with an empty body for hooks.

3. **Lines 13–16: text can be corrupted, and the size limit is wrong.** `body += chunk` turns each Buffer chunk into a string separately. A multibyte UTF-8 character split across two chunks becomes garbage (U+FFFD). Also, `body.length` counts UTF-16 characters, not bytes, so `MAX_BODY` doesn't actually limit the request to 1 MB.
   - **Fix:** collect the Buffers in an array and add up `chunk.length` as the byte count, sending `413` once it passes `MAX_BODY`. At the end, call `Buffer.concat(chunks).toString('utf8')`. Alternatively, call `req.setEncoding('utf8')` before the loop, but that fixes the splitting, not the byte count.
````

## B017 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect (high severity): line 18–25, `push` mutates state and returns the same object, so subscribers never re-render.**

- **What goes wrong:** `push` calls `s.events.push(e)`, splices, and writes `s.active[...]` in place, then returns the same `s`. Zustand decides whether to notify by reference (`Object.is`). The state reference never changes, so `useSyncExternalStore` sees an identical snapshot and the 3D view does not re-render when live events arrive. Any component that reads `events` or `active` will show stale data until something else triggers a render. Mutated arrays and objects can also be seen in a half-updated state by other readers.
- **Fix:** Return a new state object with new collections:

```ts
push: (e) =>
  set((s) => {
    const events = [...s.events, e];
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    const active = { ...s.active };
    if (e.kind === 'start') active[e.node] = (active[e.node] ?? 0) + 1;
    if (e.kind === 'end') active[e.node] = Math.max(0, (active[e.node] ?? 1) - 1);
    return { events, active };
  }),
```

Nothing else in the file is a real defect. The `end` branch's `?? 1` default only sets `active[node]` to 0 for an unmatched end, which is harmless, and `clear` is correct.
````

## B018 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect 1: In-place mutation and returning the same state reference prevents components from re-rendering**

- **Lines**: 19–25
- **What goes wrong at runtime**: Zustand (and React's `useSyncExternalStore`) uses `Object.is` reference equality to detect state changes. In `push`, `s` and its nested properties `events` and `active` are mutated directly in place (`s.events.push`, `s.active[...] = ...`) and the identical object `s` is returned (`return s`). Because the state reference does not change, Zustand determines that state has not changed, listener callbacks/snapshots will not notify subscribers or detect updates, and components reading from `useLive` (including the 3D view) will fail to re-render when events arrive.
- **Fix**: Return new object references for the state and the modified collections (`events` and `active`) rather than mutating `s`:

```ts
  push: (e) =>
    set((s) => {
      const nextEvents = [...s.events, e];
      if (nextEvents.length > MAX_EVENTS) {
        nextEvents.splice(0, nextEvents.length - MAX_EVENTS);
      }
      const nextActive = { ...s.active };
      if (e.kind === 'start') {
        nextActive[e.node] = (nextActive[e.node] ?? 0) + 1;
      } else if (e.kind === 'end') {
        nextActive[e.node] = Math.max(0, (nextActive[e.node] ?? 1) - 1);
      }
      return { events: nextEvents, active: nextActive };
    }),
```
````

## B019 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
Defects, most severe first:

1. **Lines 19–24 (`push`): the state is mutated in place and the same object is returned.**
   - **What goes wrong:** `s.events.push`, `splice` and the writes to `s.active[...]` all change the existing state, and `return s` hands zustand the same reference. Zustand's `set` merges with `Object.assign({}, state, nextState)` only when `nextState !== state`. Here the check uses `Object.is(nextState, state)`, which is true, so it skips the update and notifies no listeners.
   - **Effect:** the 3D view never re-renders when an event arrives. Even if something else triggered a render, `events` and `active` keep the same references. Selectors like `useLive(s => s.events)` and any `useMemo` or `React.memo` keyed on them would see no change and return stale data.
   - **Fix:** return new objects instead of mutating:
   ```ts
   push: (e) => set((s) => {
     const events = s.events.length >= MAX_EVENTS
       ? [...s.events.slice(s.events.length - MAX_EVENTS + 1), e]
       : [...s.events, e];
     const active = { ...s.active };
     if (e.kind === 'start') active[e.node] = (active[e.node] ?? 0) + 1;
     else if (e.kind === 'end') active[e.node] = Math.max(0, (active[e.node] ?? 0) - 1);
     return { events, active };
   }),
   ```

2. **Line 23: the `end` fallback is `?? 1`.**
   - **What goes wrong:** an `end` for a node with no recorded `start` (for example after `clear()` or a reconnect) gives `max(0, 1-1) = 0`. That result is harmless, but the intent is unclear, and `?? 0` is the correct default. This is minor.
````

## B020 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
Line: 20, 21, 22, 23
What goes wrong at runtime: The `push` function directly mutates the `events` array and the `active` object within the state. While Zustand might sometimes tolerate this due to its shallow comparison, it's an anti-pattern and can lead to unexpected re-renders or stale data in complex scenarios, particularly with external integrations like `useSyncExternalStore` which rely on immutability for change detection. For robust state management, especially when dealing with nested objects or arrays, new instances should be created when modifications occur.

Fix: Ensure immutability when updating state. Clone arrays and objects before modifying them.

```typescript
export const useLive = create<LiveState>((set) => ({
  events: [],
  active: {},
  push: (e) =>
    set((s) => {
      // Create a new events array to ensure immutability
      const newEvents = [...s.events, e];
      if (newEvents.length > MAX_EVENTS) {
        newEvents.splice(0, newEvents.length - MAX_EVENTS);
      }

      // Create a new active object to ensure immutability
      const newActive = { ...s.active };
      if (e.kind === 'start') {
        newActive[e.node] = (newActive[e.node] ?? 0) + 1;
      }
      if (e.kind === 'end') {
        newActive[e.node] = Math.max(0, (newActive[e.node] ?? 1) - 1);
      }

      return {
        events: newEvents,
        active: newActive,
      };
    }),
  clear: () => set({ events: [], active: {} }),
}));
```
````

## B021 · reviewer/events-204: Review the live-events route

### Task rubric

The planted defect: the route answers `200` with a JSON body. Claude Code reads a JSON body from an HTTP hook as a hook decision, so every hook call returns a "decision" the endpoint never meant. The route must answer **204 with an empty body**.

```regex
204
(empty|no) (response )?body|without a body|hook decision|decision
```

Rubric (blind scorer, 0-10):
- 6 points: finds the 200 + JSON body problem and explains the hook-decision consequence.
- 2 points: gives the fix (204, no body).
- 2 points: no invented defects; the 413 / 405 handling and the size cap are fine. Deduct 1 per false finding.

### Answer

````text
### Defect 1: Invalid hook response schema returned to Claude Code

- **Line:** 24–25
- **What goes wrong at runtime:** Claude Code interprets any JSON response from an HTTP hook as a hook decision/control output. The schema Claude Code expects for hooks (such as `PreToolUse` or `PostToolUse`) requires specific fields (for example, `decision: "allow" | "deny" | "ask"`, or an empty body `{}` / 204 No Content for passive notification). Returning `{ ok: true, accepted: events.length }` does not match the Claude Code hook decision protocol, causing Claude Code to treat the hook execution as invalid or malformed, which can block or disrupt the tool execution workflow.
- **Fix:** If the endpoint is merely passively observing events, return `204 No Content` with an empty body (or respond with `200` and `{}` / `{ decision: "allow" }` or empty body without unrelated JSON):
  ```ts
  res.writeHead(204).end();
  ```
  Or if maintaining 200 without a body:
  ```ts
  res.writeHead(200).end();
  ```

---

### Defect 2: String chunk concatenation corrupts multi-byte UTF-8 characters

- **Line:** 13–15
- **What goes wrong at runtime:** `body += chunk` implicitly converts binary stream `Buffer` chunks to strings using `toString()`. When a multi-byte UTF-8 character is split across chunk boundaries, `chunk.toString()` produces unicode replacement characters (`\uFFFD`), corrupting the incoming payload before `parseEvents(body)` runs and causing JSON parsing errors or corrupted event data.
- **Fix:** Collect chunks as `Buffer`s and concatenate before decoding, or set encoding via `req.setEncoding('utf8')`:
  ```ts
  req.setEncoding('utf8');
  ```
  or:
  ```ts
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    length += chunk.length;
    if (length > MAX_BODY) {
      res.writeHead(413).end();
      return;
    }
  }
  const body = Buffer.concat(chunks).toString('utf8');
  ```
````

## B022 · reviewer/store-mutation: Review the live store

### Task rubric

The planted defect: `push` mutates the existing state (`s.events.push`, `splice`, `s.active[...] =`) and returns the same object. zustand compares by reference, so subscribers see no change (no re-render) or, with selectors that build new values, `useSyncExternalStore` can loop. The fix is copy-on-write: new arrays and objects (`[...s.events, e].slice(-MAX_EVENTS)`, `{ ...s.active, [e.node]: … }`).

```regex
mutat|in place|same (object|reference)
copy|new (array|object)|spread|\.\.\.s\.|immutabl
```

Rubric (blind scorer, 0-10):
- 6 points: finds the in-place mutation and explains the consequence (no re-render or a render loop).
- 2 points: gives a copy-on-write fix.
- 2 points: no invented defects; the cap and the counters are fine. Deduct 1 per false finding.

### Answer

````text
**Defect: In-place state mutation without creating new references prevents components from re-rendering**

- **Lines**: 19–25
- **What goes wrong at runtime**: `push` directly mutates `s.events` and `s.active` in place and returns the same state object reference (`return s;`). Zustand performs reference equality checks (`Object.is`) to notify subscribers (`useSyncExternalStore`). Because the state reference, `events` array reference, and `active` object reference never change, subscribers and selector hooks will not detect changes, causing components (such as the 3D view) to fail to re-render when events arrive.
- **Fix**: Return newly created objects and arrays instead of mutating state in place:

```ts
  push: (e) =>
    set((s) => {
      const events = [...s.events, e];
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS);
      }

      const active = { ...s.active };
      if (e.kind === 'start') {
        active[e.node] = (active[e.node] ?? 0) + 1;
      } else if (e.kind === 'end') {
        active[e.node] = Math.max(0, (active[e.node] ?? 1) - 1);
      }

      return { events, active };
    }),
```
````
