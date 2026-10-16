# Blind rubric sheet

Score each answer 0-10 against its task rubric and rubric.md. You do not know which model wrote it; do not try to guess.

## B001 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. **Root cause:** the Pause/Resume button calls `change('POST', path)` with no body, so `callAdmin` sends no `Content-Type` header. The server's CSRF guard in `senderAction` correctly rejects the request with 415. The CLI works because it always sends a JSON body.

2. **Change `src/app/hud/hubAdminApi.ts` only.** In `callAdmin`, for any method other than `GET`, always set `headers: { 'Content-Type': 'application/json' }` and `body: JSON.stringify(body ?? {})`. Keep `GET` as it is now: no body and no header. This fixes pause and resume, plus any other body-less POST, PUT or DELETE such as revoke, in one place.

3. **Leave the `HubAdmin.tsx` button as it is.** The fix belongs in the shared helper, not at each call site. Search for other `change(` and `callAdmin(` calls that pass no body. They are fixed by step 2 and should stay unchanged.

4. **Do NOT change `src/server/guard.ts` (`isJson`) or the 415 check in `src/server/hub-admin.ts`.** Do not relax the check to allow a missing `Content-Type`, and do not treat an empty body as exempt. That check is the CSRF defence: a cross-site HTML form cannot send `application/json`. Loosening it would reopen admin actions to CSRF.

5. **Do not add CORS or a "simple request" workaround.** Do not add an alternative path through a query string or `text/plain` either.

6. **Client unit test (`hubAdminApi.test.ts`):** mock `fetch` and call `callAdmin('POST', '/senders/bob-laptop/pause')`.
   - Assert the `Content-Type` header is `application/json`.
   - Assert the body is `'{}'`.
   - Assert that a `GET` call still sends neither a header nor a body.

7. **Server regression tests (`hub-admin` tests):**
   - POST to `/senders/:id/pause` with no `Content-Type` still returns 415.
   - POST with `text/plain` still returns 415.
   - POST with `application/json` and body `{}` returns 2xx and the sender becomes paused.
   - Repeat the last case for resume.

8. **Manual check:** in the hub UI, Admin › Senders › Pause and then Resume. The network tab should show 2xx responses and the sender's state should toggle.
````

## B002 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
**Root cause:** `callAdmin` omits the `Content-Type` header when no body is passed, and the pause/resume button calls it with no body. The server's CSRF guard (`isJson`) then rejects the request with 415. The CLI works because it always sends JSON.

**Plan**

1. **Fix the client in `src/app/hud/HubAdmin.tsx`.** In the pause/resume button's `change(...)` call, pass an explicit empty JSON body (`{}`). `callAdmin` will then set `Content-Type: application/json` and send `"{}"`. Apply the same to every other bodyless state-changing call in the file, such as revoke and any other POST/DELETE with no body. Grep for all `change(` and `callAdmin(` call sites that omit a body.

2. **Optionally harden `callAdmin` in `src/app/hud/hubAdminApi.ts`.** For non-GET methods, always send `Content-Type: application/json` and use `body ?? {}`. This fixes the whole class of bug in one place instead of at each call site. Keep GET unchanged, with no header and no body. I prefer doing this in addition to step 1 or instead of it, so future buttons can't regress. Choose one approach and don't duplicate logic confusingly.

3. **Make no change to `src/server/guard.ts` or `isJson`.** The JSON-only requirement is the CSRF defense. It stops cross-site HTML forms, which can only send form or text content types, from triggering admin actions. Relaxing it to allow a missing content type would reopen that hole.

4. **Make no change to `senderAction` in `hub-admin.ts`.** Don't skip the `isJson` check for the pause, resume and revoke routes. The server is behaving as designed, and the client is the part that is wrong.

5. **Check that the server tolerates `{}`.** Confirm that `senderAction` parses an empty-object body without error and doesn't require any fields. If it reads the body strictly, adjust only the client payload, not the guard.

6. **Add a unit test for `callAdmin`.** Mock `fetch` and assert that a POST with no body sends `Content-Type: application/json` and a parseable JSON body. Also assert that a GET sends no content type.

7. **Add a server or integration test.** Cover three cases:
   - POST to `/senders/x/pause` with a JSON content type returns 2xx.
   - The same POST with no content type, or with `application/x-www-form-urlencoded`, still returns 415. This guards the CSRF protection.
   - Pause followed by resume toggles the sender's `paused` state.

8. **Verify manually.** In the hub UI, click Pause and then Resume on a sender. Confirm in the network tab that the requests carry `Content-Type: application/json` and return 200, and that the UI state updates.
````

## B003 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Freeze and log the request (studio lead, now).** Do not start any work. Create a Linear issue for "Donation page + card payments (3 locales)" marked as a change request, with no estimate yet. Tell the client in writing that it is outside the signed sitemap and scope and that an estimate follows. Needs: the client's written request and the signed sitemap and scope from sign-offs 1 and 3.

2. **Scope the change (ia-architect, then copywriter, designer).** The ia-architect drafts the sitemap delta: the donation page's place in the tree, its URL in each locale, and its links from existing pages. Copywriter and designer then size the copy and layout work in all three locales. Needs: step 1 logged; current signed sitemap and content model.

3. **Specify the backend work (backend-lead).** Define the donation data model (amounts, currency, donor fields, receipt state, locale), the Payment provider integration, webhooks and idempotency, and PCI boundaries (hosted card fields or checkout redirect, so no card data touches our servers). Needs: step 2 sitemap delta; payment provider choice, which the client must confirm.

4. **Contract first (backend-lead, then frontend-lead reviews).** Add the new endpoints and schemas to `api/openapi.yaml` before any frontend work touches them. Frontend lead confirms it can build against the contract as written. Needs: step 3 spec. The frontend lane must not invent an endpoint; if the contract lacks one, the backend lead adds it first.

5. **Estimate and get client approval (studio lead).** Combine the steps 2 to 4 effort into a change request with price and timeline, covering build, payment integration, translation, and QA for the donation flow. Pause work on the donation items until the client accepts in writing. Needs: steps 2 to 4 outputs; approved estimate.

6. **Update Linear (studio lead).** One issue per page template, component and endpoint: donation page template, donation form component, receipt/confirmation component, payment-intent endpoint, webhook endpoint, and per-locale copy tasks. Link each to the change request. Needs: step 5 approval.

7. **Build (frontend-lead and backend-lead, in parallel).** Backend lane implements the models, payment integration, and endpoints in Payload and the API. Frontend lane builds the page and components against the contract, using mocks until the backend lands. Both lanes keep the existing build running and do not change signed scope. Needs: step 4 contract locked; step 6 issues created.

8. **Localization and copy sign-off (copywriter, designer).** Copy for all three locales and layouts checked for text expansion. Needs: step 7 frontend in progress, step 5 approval. This is a new content sign-off under the change request; cap rounds as agreed in the change request.

9. **QA gate on preview (qa-auditor).** Run the audit on the preview deployment, covering payment flows in test mode, webhook retries, failure states, accessibility, and all three locales. The gate must be green before any client review. Needs: step 7 and step 8 complete on the preview URL.

10. **Client review and launch (studio lead).** Client reviews the donation flow on the same preview URL, max 3 rounds under the change request. After sign-off, release through the rolling launch, switch payments to live keys, and monitor payment success, webhook errors, and conversion. Needs: step 9 green; client sign-off; live payment credentials and a rollback plan.
````

## B004 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
**Plan: donation page change request**

1. **Studio lead: log the request as a change request (CR).**
   - Needs: the signed sitemap and scope, which confirm the donation page is not in them.
   - Action: open a CR in Linear and tell the client that work starts only after they approve it.
   - Action: confirm that current build lanes continue unchanged. Nothing is built silently.

2. **ia-architect + backend-lead: scope and estimate.**
   - Needs: the CR from step 1.
   - Action: define the sitemap addition, the content model (a Payload `donations` collection or global, plus donation records), and the URLs in all three locales.
   - Action: choose the payment approach. Recommend a hosted provider such as Stripe Checkout or Payment Element, so card data never touches our servers (minimal PCI burden).
   - Open questions for the client: currencies per locale, recurring or one-off donations, receipts or tax certificates, and who owns the provider account.
   - Output: an estimate covering design, copy ×3, frontend, backend, QA and timeline impact.

3. **Studio lead: get client approval.**
   - Needs: the estimate from step 2.
   - Action: client signs the CR (cost and date shift) and confirms the payment provider account and legal texts (privacy, donation terms).
   - This is an addendum to sign-off 1 for this page only. No work proceeds without it.

4. **Studio lead: update Linear.**
   - Needs: the approved CR.
   - Action: create one issue each for:
     - the donation page template
     - new components (amount selector, payment form wrapper, success and failure states)
     - each endpoint (e.g. `POST /donations/checkout-session`, `POST /webhooks/payments`)
     - the Payload collection changes
   - Action: link all issues to the CR.

5. **designer + copywriter: design and copy, in parallel.**
   - Needs: the approved CR and the content model from step 2.
   - Designer: designs the page using the existing signed visual system, including error, success and cancel states.
   - Copywriter: writes the copy in all three locales, including payment errors, receipt email and legal microcopy.

6. **Studio lead: QA gate, then design and copy sign-off.**
   - Needs: step 5 output and a green QA gate (qa-auditor checks accessibility, locale completeness and consistency with the signed design).
   - Action: the client signs design and copy for this page within the 3-round limit, which applies separately to this addendum.

7. **backend-lead: contract first.**
   - Needs: the approved CR and the provider decision. This can start right after step 3, in parallel with step 5.
   - Action: add the endpoints to `api/openapi.yaml`, add the Payload collection, and implement the checkout session and a signed, idempotent webhook.
   - Action: keep provider secrets server-side only, with test keys on preview.
   - Action: publish the contract change before frontend integration starts.

8. **frontend-lead: build the page in all three locales.**
   - Needs: the merged contract from step 7 and the signed design and copy from step 6.
   - Action: integrate only against the contract endpoints. Any missing endpoint goes back to the backend-lead to add first.

9. **qa-auditor: QA on the preview deployment.**
   - Needs: steps 7 and 8 deployed to preview.
   - Coverage:
     - provider test cards, including success, decline, 3-D Secure and cancel
     - webhook retries and idempotency
     - all three locales and currencies
     - accessibility and performance
     - no card data in our logs
   - The gate must be green before step 10.

10. **Studio lead: client review, then launch.**
    - Needs: a green QA gate from step 9.
    - Action: client review on the same preview URL, maximum 3 rounds.
    - Action: after sign-off, switch to live keys and include the page in the rolling release.
    - Action: monitor payment success rates, webhook failures and errors.
    - Action: close the Linear issues and the CR.
````

## B005 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Studio lead: classify the request as a change request.** The donation page is not in the signed sitemap (sign-off 1) or scope. Card payments add a new backend surface (payment provider, PCI, webhooks), and the three locales add copy and design work. Nothing starts until the client approves the estimate. Needs: the signed sitemap and scope documents.

2. **Studio lead: gather inputs for the estimate.** Ask the client for the payment provider (e.g. Stripe), one-off vs recurring donations, amounts, receipts and tax requirements, the legal entity, and GDPR/consent needs. Needs: the client's answers, which gate step 4.

3. **ia-architect: assess the sitemap impact.** Define where the page sits (URL per locale, navigation, thank-you and error states) and the content model additions. Needs: step 2 answers.

4. **Parallel estimates from the specialists.** All of these feed one estimate covering cost, timeline and effect on the current build. Needs: steps 2–3.
   - designer: page and form states, in 3 locales.
   - copywriter: copy in 3 locales, plus legal and receipt text.
   - backend-lead: payment intent and webhook endpoints, a Payload `donations` collection, security and PCI scope (hosted or Stripe Elements checkout, no card data on our servers).
   - frontend-lead: the page template and form components.

5. **Studio lead: send the change request and get written approval.** Include the estimate, the schedule impact and the revision limits. Needs: step 4. Nothing below starts without approval.

6. **Studio lead: update Linear.** Add one issue per new page template, component and endpoint, tagged as a change request. Needs: step 5.

7. **Design and copy, with a mini sign-off.** The designer and copywriter produce the donation page designs and 3-locale copy, then get client sign-off, treated as an addendum to sign-off 3. Needs: step 5. Needs the QA gate green first (step 9 applies to this too).

8. **Backend-lead goes first, then frontend-lead.** Needs: step 7 for the frontend.
   - backend-lead: add the endpoints to `api/openapi.yaml` and the Payload collections, then implement them. Test with provider sandbox keys.
   - frontend-lead: build only against the updated contract, and invent no endpoints.

9. **qa-auditor: run the QA gate on the preview deployment.** Cover test-mode payments (success, decline, 3DS), webhook handling, all 3 locales, accessibility, and regression on existing pages. Needs: step 8 complete. Fix and re-test until green.

10. **Client review and launch.** Run client review of the donation page on the same preview URL as the existing review rounds, within the 3-round maximum. After approval, switch to live keys and launch with a rolling release, then monitor payments and webhooks. Needs: step 9 green.
````

## B006 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
Here's the plan:

1.  **Root Cause**: The `callAdmin` function on the client-side omits the `Content-Type: application/json` header for `POST` requests when no explicit request body is provided, causing the server's `isJson` guard to reject the request.
2.  **File Change**: Modify `src/app/hud/hubAdminApi.ts`.
3.  **How to Change**: In `callAdmin`, ensure the `Content-Type: application/json` header is *always* sent for `POST`, `PUT`, and `DELETE` methods, even if `body` is `undefined`.
4.  **Specific Code Change**: Update the `headers` object construction in `callAdmin` to:
    ```typescript
    export async function callAdmin<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
      const headers: HeadersInit = {};
      if (method !== 'GET') { // POST, PUT, DELETE methods
        headers['Content-Type'] = 'application/json';
      }
    
      const res = await fetch(`/api/hub/admin${path}`, {
        method,
        headers: Object.keys(headers).length > 0 ? headers : undefined, // Only pass headers if there are any
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // ... rest of the function
    }
    ```
5.  **What Must NOT Change**: The `src/server/guard.ts` `isJson` function and its usage in `src/server/hub-admin.ts` must *not* change.
6.  **Why Not Change**: The `isJson` guard provides a critical Cross-Site Request Forgery (CSRF) protection by ensuring that state-changing admin actions can only be triggered by requests with an `application/json` content type, which cannot be forged by simple HTML forms. Removing it would introduce a security vulnerability.
7.  **Test the Fix**:
    *   Navigate to the Hub UI in your browser.
    *   Go to Admin › Senders.
    *   Click the "Pause" button next to a sender.
    *   Verify that the sender's status changes to "Paused" and no `415` error appears in the browser console.
    *   Click the "Resume" button next to a paused sender.
    *   Verify that the sender's status changes back to "Running".
````

## B007 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Studio lead: classify the request as a change request.** A donation page with card payments is not in the signed sitemap or scope. I write up the scope: the page template, the payment endpoints, the provider integration, the content for 3 locales, and the legal/compliance items. Needs: the signed sitemap and scope documents. Existing build lanes continue unchanged while this is pending.

2. **Studio lead: get estimates and open Linear placeholders.** I ask ia-architect, designer, copywriter, frontend-lead and backend-lead for effort and risk. The payment provider choice, PCI scope (hosted checkout vs. embedded), recurring vs. one-off gifts, receipts and tax-deductibility need to be settled. Linear gets a "Change request: Donation" epic, with one issue each for the page template, components and endpoints, marked blocked until approval. Needs: step 1.

3. **Studio lead: send the change request to the client for written approval.** It includes the cost, the timeline impact, the open questions above, and the ask for the provider account and legal copy owner. Nothing is built or designed until approval is received. Needs: the estimates from step 2.

4. **ia-architect: update the sitemap.** Add the donation page and its confirmation and failure states in the 3 locales, and update the content model (e.g. a donation page collection and a campaign/amount presets). Sign-off 1 is amended by the client. Needs: approval from step 3.

5. **Designer and copywriter, in parallel: design and copy.** The designer produces the donation page and payment states in the existing design system, within the sign-off 3 round limit (an addendum, not a reopening). The copywriter writes the page, form errors, receipt email text and consent/legal text in all 3 locales. Needs: step 4. The client signs off on the addendum.

6. **Backend-lead: extend the contract first.** Add the donation endpoints to `api/openapi.yaml` (create payment intent/session, provider webhook, status), plus Payload collections for donations. Handle secrets, idempotency and webhook verification, and keep card data off our servers. Then create the endpoint issues in Linear. Needs: step 4 and the provider decision. This must be published before the frontend consumes it.

7. **Frontend-lead: build the donation page.** Build it against the updated contract, with no invented endpoints, using the signed designs and locale strings. Create issues for the template and components. Needs: steps 5 and 6 (the contract published, with the mock if the backend is not ready).

8. **Backend-lead: implement the endpoints and webhooks** and test them against the provider's sandbox. Needs: step 6. Runs parallel to step 7.

9. **QA-auditor: run the QA gate on the preview deployment.** Cover the end-to-end sandbox payment flow, failures and declines, webhook retries, all 3 locales, accessibility, and performance. The gate must be green before the client sees it. Needs: steps 7 and 8 merged to preview.

10. **Studio lead: client review and launch.** Client review on the same preview URL (within the 3-round limit), then sign-off. Launch with the rolling release, with live-key checks and a small real transaction test, then monitor payments, webhook errors and conversions. Needs: a green QA gate and the client sign-off.
````

## B008 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
Here is the implementation plan:

1. **Root Cause**: `callAdmin` omits the `Content-Type` header when `body` is `undefined`, so `POST` requests without a body fail the CSRF-protection `isJson` check enforced by `hub-admin.ts`.
2. **What Must NOT Change**: Do not modify `src/server/guard.ts` or the `isJson` check in `src/server/hub-admin.ts`, as requiring `application/json` on state-changing endpoints is an intentional CSRF defense against cross-site form submissions.
3. **File to Change (Option A - Preferred API-level fix)**: In `src/app/hud/hubAdminApi.ts`, update `callAdmin` to always include `headers: { 'Content-Type': 'application/json' }` (and send an empty body like `{}` or `JSON.stringify(body ?? {})`) when `method` is state-changing (`POST`, `PUT`), or whenever `method !== 'GET'`.
4. **Alternative / Targeted Fix (Option B - UI call site)**: In `src/app/hud/HubAdmin.tsx`, pass an empty object body `{}` to `change(...)` for pause and resume (and verify revoke or other sender actions do the same): `change('POST', ..., {})`.
5. **Verify Other Admin Calls**: Audit `src/app/hud/HubAdmin.tsx` and related HUD admin callers for any other bodyless `POST`/`PUT`/`DELETE` calls to ensure they also supply `Content-Type: application/json`.
6. **Testing**: 
   - Open Admin › Senders in the web HUD, click "Pause" and "Resume" on a sender, and confirm the HTTP request succeeds with `200 OK` (no 415 error) and the sender status updates.
   - Run existing unit/integration tests for the hub admin API and CLI (`flow-tower token pause`) to ensure no regressions.
````

## B009 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
# Plan: donation page with card payments, change request after sign-off 3

The donation page is not in the signed sitemap or scope. It enters as a change request (CR) with an estimate. No one starts building it until the client approves. The current build lanes keep running on the signed scope.

1. **Studio lead: log the CR.**
   - Record the request as a change request in Linear.
   - Tell the client it is out of the signed scope. It will be estimated and won't delay the current build unless they choose to fold it in.
   - *Needs:* the client's request in writing.

2. **ia-architect: scope the change to the information architecture.**
   - Add the donation page to the sitemap.
   - Extend the content model with fields for donation copy, suggested amounts, a thank-you or confirmation state, and all three locales.
   - *Needs:* the logged CR, the signed sitemap and the signed content model.

3. **backend-lead: scope payments and estimate the backend.**
   - Choose a hosted payment provider, for example Stripe Checkout or Payment Elements, so card data never touches our servers. This keeps PCI scope minimal.
   - Define the endpoints: create a payment intent or checkout session, and receive the provider's webhook.
   - Define the Payload `donations` collection.
   - Cover currency per locale, receipts and GDPR handling.
   - Estimate the work.
   - *Needs:* step 2.

4. **designer + copywriter: estimate the design and copy.**
   - Designer: estimate the page template, the reuse of existing components and the new states (amount picker, success, error).
   - Copywriter: estimate the copy in all three locales, including legal and receipt text.
   - *Needs:* step 2. Runs in parallel with step 3.

5. **Studio lead: send the CR to the client for approval.**
   - Send one combined estimate covering cost and timeline impact, including any effect on the launch date.
   - Ask the client to approve the scope and budget in writing. Wait for that approval before any work starts.
   - *Needs:* steps 3 and 4.

6. **Studio lead: update Linear.**
   - Create one issue each for the donation page template, each new component (amount selector, payment form wrapper, confirmation) and each endpoint (checkout session, webhook).
   - Link every issue to the CR.
   - *Needs:* the client's approval from step 5.

7. **designer + copywriter: produce the design and copy for the page.**
   - Design and write the page within the existing visual system, in all three locales.
   - Treat this as a scoped mini sign-off 3, with at most 3 rounds.
   - *Needs:* step 6.
   - **backend-lead, in parallel:** add the endpoints to `api/openapi.yaml` and add the Payload collection. Implement both against the provider's sandbox, including webhook verification. *Needs:* step 6.

8. **Close the mini sign-off 3.**
   - qa-auditor: check the design for accessibility, contrast and the copy in all three locales. The QA gate must be green.
   - Studio lead: then obtain the client's sign-off on the design and copy.
   - *Needs:* the design and copy from step 7.

9. **frontend-lead: build the page.**
   - Build the template and components only against the published contract endpoints. If anything is missing from the contract, the backend lead adds it first.
   - *Needs:* the client sign-off from step 8 and the merged contract and collection from step 7.

10. **QA, client review, launch.**
    - **QA (qa-auditor):** run on the preview deployment.
      - Payment flows in sandbox: success, decline, 3-D Secure (3DS) and webhook retries.
      - All three locales and currencies.
      - Accessibility and security headers.
    - **Client review:** only once the QA gate is green. Use the same preview URL, with at most 3 rounds.
    - **Launch:** switch to live provider keys and use a rolling release.
    - **Monitoring:** watch payment error rates and webhook failures.
    - *Needs:* step 9.
````

## B010 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. **Root cause:** `callAdmin` sets `Content-Type: application/json` only when a body is passed, and the Pause/Resume button calls `change('POST', path)` with no body. The request therefore arrives with no content type, and `senderAction` correctly rejects it with 415. The CLI works because it sends a JSON body.

2. **Change `src/app/hud/hubAdminApi.ts` (the main fix).** For every state-changing method (POST, PUT, DELETE):
   - Always send `Content-Type: application/json`.
   - Always send a JSON body: `JSON.stringify(body ?? {})`.
   - For GET, keep the current behaviour: no body, no content-type header.
   - This fixes every body-less admin action in one place, not only Pause/Resume. Revoke likely has the same bug.

3. **Optional change in `src/app/hud/HubAdmin.tsx`.** You may pass an explicit `{}` body in the pause/resume `change(...)` call for clarity. Step 2 must not depend on it.

4. **Check other `callAdmin` and `change` callers.** Grep for POST, PUT and DELETE calls that pass no body, and confirm they now work. Make sure no server route rejects a `{}` body; the `senderAction` handlers ignore the body.

5. **Do NOT change `src/server/guard.ts` `isJson`.** Do not remove or loosen the 415 check in `src/server/hub-admin.ts`.
   - The JSON content-type requirement is the CSRF defence: a cross-site HTML form cannot send `application/json`.
   - Do not accept an empty or missing content type, and do not add `text/plain`. Either would reopen that hole.
   - The server is behaving correctly; only the client is wrong.

6. **Unit test for `hubAdminApi`.** Mock `fetch`, then:
   - Call `callAdmin('POST', '/senders/bob-laptop/pause')` and assert the request has `Content-Type: application/json` and body `'{}'`.
   - Call `callAdmin('GET', '/senders')` and assert it sends no body and no content-type header.

7. **Server regression test for `hub-admin` (must keep passing or be added).**
   - POST `/senders/x/pause` with no content type → 415.
   - The same with `Content-Type: text/plain` → 415.
   - The same with `application/json` and `{}` → success, and the sender is marked paused. Do the same for resume.

8. **Manual check.** In the hub UI, Admin › Senders › Pause should toggle to Resume, and the reverse. The console should show no 415 errors.
````

## B011 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
Here is the plan to address the client's request for a new donation page:

1.  **Formalize Change Request & Initial Scoping**:
    *   **Who**: Studio Lead
    *   **What**: Document the client's request for a donation page with card payments across three locales as a formal change request. Identify the core components: new page, payment gateway integration, localization.
    *   **Needs before**: Client request received.

2.  **Estimate Preparation (Parallel Tracks)**:
    *   **Who**: ia-architect, designer, copywriter, frontend-lead, backend-lead, qa-auditor (all in parallel, coordinated by Studio Lead)
    *   **What**:
        *   ia-architect: Estimate sitemap addition and content model updates.
        *   designer: Estimate wireframing and visual design for the donation page (form, success, error states).
        *   copywriter: Estimate copy for the page, payment flow, and localized messages.
        *   backend-lead: Estimate API endpoints for payment processing (e.g., creating a donation, handling webhook callbacks from payment gateway) and database schema changes, including localization.
        *   frontend-lead: Estimate UI implementation, payment gateway integration, and localization.
        *   qa-auditor: Estimate QA efforts for the new feature.
    *   **Needs before**: Studio Lead has formalized the request.

3.  **Present & Obtain Client Approval for Change Request & Estimate**:
    *   **Who**: Studio Lead
    *   **What**: Compile all estimates into a comprehensive proposal, explaining the scope, timeline, and cost. Present this to the client and secure formal sign-off to proceed.
    *   **Needs before**: All individual estimates from Step 2 are complete.

4.  **Sitemap & Content Model Update**:
    *   **Who**: ia-architect
    *   **What**: Add the donation page to the sitemap and define its content model (e.g., configurable text, suggested amounts, legal disclaimers). Create Linear issues for these.
    *   **Needs before**: Client approval of the change request and estimate (Step 3).

5.  **Wireframes**:
    *   **Who**: designer
    *   **What**: Create wireframes for the donation page, including various states (initial form, loading, success, error) and mobile responsiveness, for all three locales.
    *   **Needs before**: Approved sitemap and content model (Step 4).

6.  **Wireframe Review & Sign-off**:
    *   **Who**: Studio Lead, client (with QA gate)
    *   **What**: Client review of the wireframes. Ensure QA-auditor has validated wireframe clarity before client presentation. (Max 2 rounds)
    *   **Needs before**: Completed wireframes (Step 5), QA gate passed.

7.  **Visual Design & Copy (Parallel Tracks)**:
    *   **Who**: designer, copywriter
    *   **What**:
        *   designer: Apply visual design to the approved wireframes, incorporating branding and user experience considerations for all locales.
        *   copywriter: Develop and localize all necessary copy for the donation page and payment flow.
    *   **Needs before**: Approved wireframes (Step 6).

8.  **Visual Design & Copy Review & Sign-off**:
    *   **Who**: Studio Lead, client (with QA gate)
    *   **What**: Client review of the visual design and copy for all locales. Ensure QA-auditor has validated consistency and completeness before client presentation. (Max 3 rounds)
    *   **Needs before**: Completed visual design and copy (Step 7), QA gate passed.

9.  **Build Phase (Parallel Tracks)**:
    *   **Who**: backend-lead, frontend-lead
    *   **What**:
        *   backend-lead: Implement API endpoints for donation processing, integrate with chosen payment gateway, update Payload collections, and define/update `api/openapi.yaml` accordingly. Create Linear issues for new endpoints.
        *   frontend-lead: Implement the donation page UI, integrate with the backend API and payment gateway using the agreed `api/openapi.yaml`, and implement localization. Create Linear issues for the new page template and components.
    *   **Needs before**: Signed-off visual design and copy (Step 8). Frontend-lead waits for backend-lead to add new endpoints to `api/openapi.yaml` if needed.

10. **QA on Preview & Client Review**:
    *   **Who**: qa-auditor, Studio Lead, client
    *   **What**: qa-auditor performs thorough testing of the donation page, payment flow, and localization on the preview deployment. Studio Lead coordinates client review on the same URL after QA gate is green. (Max 3 rounds)
    *   **Needs before**: Frontend and Backend build for the donation page is complete and deployed to preview environment (Step 9). QA gate passed.
````

## B012 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. **Root cause:** The Pause/Resume button calls `change('POST', path)` with no body, so `callAdmin` omits the `Content-Type` header, and `senderAction` correctly rejects the request with 415 because `isJson` fails. The CLI works because it sends a JSON body.

2. **Client fix in `src/app/hud/HubAdmin.tsx`:** Pass an explicit JSON body for the pause and resume actions, for example `change('POST', path, {})`. Make the same change to any other bodyless POST in this file, including revoke if it has the same pattern. Keep the `change` helper's signature as it is unless it drops the body argument.

3. **Optional hardening in `src/app/hud/hubAdminApi.ts`:** Consider having `callAdmin` default to `{}` with the JSON header when `method === 'POST'` and `body` is undefined. This prevents the same bug from recurring on future POST buttons. It is optional because the minimal fix in step 2 already resolves the bug. If you do it, confirm no POST caller depends on sending an empty body.

4. **Must NOT change: `src/server/guard.ts` and the `isJson` check in `senderAction`.** The `application/json` requirement is the CSRF defense. A cross-site HTML form can only send form or text bodies, so it cannot satisfy the check. Relaxing the check, accepting any content type, or exempting pause/resume would reopen the attack. The server's 415 response is working as intended, and the client should adapt to it.

5. **Must NOT change: the CLI path and the server routes.** `flow-tower token pause` already works, so leave its request format and the `/pause` and `/resume` route handlers alone.

6. **Test (client):** In the HubAdmin test suite, render a sender with `paused: false`, click Pause, and assert that `fetch` is called with `/api/hub/admin/senders/bob-laptop/pause`, method `POST`, header `Content-Type: application/json`, and body `"{}"`. Add a matching case for Resume with `paused: true`.

7. **Test (server, regression guard):** In the hub-admin server tests, assert that `POST .../pause` with `Content-Type: application/json` returns 200 and changes state. Also assert that the same request with `Content-Type: application/x-www-form-urlencoded` or `text/plain` still returns 415 and does not change state. The second assertion proves the CSRF protection stays in place.

8. **Acceptance:** Run the full test suite. Then manually click Pause and Resume in the hub Admin UI and confirm the network request returns 200, the sender's state updates, and the console shows no 415 error.
````

## B013 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. **Root cause:** `callAdmin` only sets `Content-Type: application/json` when a `body` is passed. The Pause/Resume button calls `change('POST', path)` with no body, so the request has no Content-Type. The server's `isJson` CSRF guard then correctly rejects it with 415. The CLI works because it always sends a JSON body.

2. **Change `src/app/hud/hubAdminApi.ts` (the main fix).** In `callAdmin`, for every method other than `GET`:
   - always send `headers: { 'Content-Type': 'application/json' }`;
   - send `body: JSON.stringify(body ?? {})`, so a bodiless POST, PUT or DELETE sends `{}`.
   
   `GET` stays as it is today: no body and no Content-Type, because a GET with a body is invalid in `fetch`. This one change fixes Pause, Resume, Revoke and any other bodiless admin action in a single place, rather than patching each button.

3. **Leave `src/app/hud/HubAdmin.tsx` alone.** Do not add `{}` at the call site. Once the client is fixed, the button works without it.

4. **Check what the handlers do with `{}`.** Confirm that the `senderAction` handlers in `src/server/hub-admin.ts` accept an empty `{}` body. They should either ignore the body or parse it leniently. If a handler fails on `{}`, make it treat a missing or empty object as "no options". Do not touch the `isJson` check while doing this.

5. **Must NOT change:**
   - `src/server/guard.ts` `isJson`, and the 415 check in `senderAction` and the other state-changing routes, must stay exactly as they are. Requiring `application/json` is the CSRF defence: a cross-site HTML form cannot send that content type. Loosening it, for example by allowing an empty Content-Type or an empty body, would reopen that hole.
   - Do not switch to `text/plain` or form encoding.
   - The CLI behaviour must not change.

6. **Unit test (`hubAdminApi`).** Mock `fetch` and assert:
   - `callAdmin('POST', '/senders/x/pause')` sends `Content-Type: application/json` and body `'{}'`;
   - a call with an explicit body is serialised unchanged;
   - `callAdmin('GET', …)` sends no body and no Content-Type.

7. **Server regression test (`hub-admin`).** Assert:
   - POST to `/senders/bob-laptop/pause` with JSON `{}` returns success and marks the sender paused;
   - resume clears the paused state;
   - the same POST with no Content-Type, or with `text/plain`, still returns 415. This proves the CSRF guard is intact.

8. **Manual check.** In the hub UI, go to Admin › Senders and click Pause, then Resume, on a sender. The state should toggle, and the console should show no 415 error.
````

## B014 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
Here's the plan for integrating the new donation page:

1.  **Studio Lead:** Initiate a Change Request for the donation page. Gather initial scope details from the client (payment specifics, design preferences if any).
2.  **ia-architect, designer, copywriter, frontend-lead, backend-lead, qa-auditor:** Provide effort estimates for their respective tasks related to the donation page (sitemap/content model updates, wireframes, visual design, copy, frontend implementation including payment UI, backend payment integration/API, and QA).
3.  **Studio Lead:** Present the Change Request and estimate to the client for approval. *Needs:* Specialist estimates.
4.  **ia-architect:** Update the sitemap and content model for the new donation page, incorporating the payment functionality and three locales. Create Linear issues for new page template, components, and content fields. *Needs:* Client approval of Change Request.
5.  **designer:** Create wireframes and visual designs for the donation page, including states for payment processing and locale variations. Create Linear issues for new components/templates. *Needs:* Updated sitemap/content model.
6.  **copywriter:** Produce copy for the donation page across all three locales. *Needs:* Approved visual designs and content model.
7.  **Studio Lead:** Conduct an internal review of the sitemap/content model, wireframes, visual designs, and copy. If all green, present to client for approval (this functions as a mini-Sign-off 1, 2, and 3 for the new scope). *Needs:* Approved designs and copy, and green QA gate (internal review of designs/copy quality).
8.  **backend-lead:** Develop the necessary API endpoints for payment processing and integrate with the chosen payment gateway. Update `api/openapi.yaml` and Payload collections. Create Linear issues for new endpoints. *Needs:* Client approval of donation page designs, payment gateway details.
9.  **frontend-lead:** Implement the donation page UI, integrate with the backend payment API, and ensure multi-locale support. Create Linear issues for frontend components. *Needs:* Client approval of donation page designs, completed `api/openapi.yaml`, and Payload collections.
10. **qa-auditor:** Conduct comprehensive QA on the new donation page functionality, including payment processing, multi-locale content, and responsiveness, on the preview deployment. *Needs:* Deployed frontend and backend changes for the donation page.
````

## B015 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. **Root cause:** The server enforces `Content-Type: application/json` via `isJson(req)` on all state-changing admin routes as a CSRF protection measure, but `HubAdmin.tsx` calls `change` (and thus `callAdmin`) without a body, causing `callAdmin` to omit the `Content-Type` header entirely.
2. **What must NOT change:** Do not relax or remove the `isJson(req)` check in `src/server/guard.ts` or `src/server/hub-admin.ts`; doing so would weaken the CSRF defense that prevents malicious HTML forms from triggering admin actions.
3. **File to change (`src/app/hud/HubAdmin.tsx`):** Update the call to pass an empty JSON body payload (e.g. `{}`), or update the UI handler to provide `{}` as the `body` argument: `change('POST', \`/senders/\${encodeURIComponent(s.id)}/\${s.paused ? 'resume' : 'pause'}\`, {})`.
4. **File to change (`src/app/hud/hubAdminApi.ts`):** Alternatively (and preferably to fix all bodyless mutating requests consistently), ensure `callAdmin` sets `headers: { 'Content-Type': 'application/json' }` and `body: JSON.stringify(body ?? {})` for mutating HTTP methods (`POST`, `PUT`, `DELETE`).
5. **Verification test (manual):** Log in to the hub admin UI, navigate to Admin › Senders, click "Pause" (and "Resume") on a sender, and verify that the request succeeds with HTTP 200/204 and no 415 error in the browser console.
6. **Automated test:** Add/run an integration test targeting `POST /api/hub/admin/senders/:id/pause` verifying that requests sent from the client helper successfully include the `Content-Type: application/json` header and return a 2xx response.
````

## B016 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Freeze and log the request (studio lead, now).** Do not start any work. Record the client's ask as a change request in Linear: donation page, card payments, three locales. Note that it sits outside the signed sitemap and scope. Input: the client message. Output: a CR issue with an open status.

2. **Estimate the change (ia-architect, then backend-lead and frontend-lead, in parallel).** The ia-architect adds the donation page to a draft sitemap delta and content model delta, with the three locale variants. Backend-lead estimates payment integration, Payload collections for donations, webhook handling and compliance (PCI scope via hosted checkout). Frontend-lead estimates the page templates, forms and locale handling. Needs: step 1 done.

3. **Assemble and send the CR estimate (studio lead).** Combine the estimates into one priced change request with timeline impact on the current build and the launch date. Send to the client for approval. Needs: step 2 done. Nothing below starts until the client signs the CR.

4. **Client approves the CR (client).** Written approval of scope, price, and schedule. Needs: step 3 delivered. If declined, close the CR and stop.

5. **Re-sign the scope (ia-architect, then studio lead).** Update the signed sitemap and content model with the donation page and locale variants. Get the client's sign-off on the delta. Needs: step 4 approved. This keeps the sitemap truthful before any design or build work.

6. **Design and copy for the new page (designer and copywriter, in sequence).** Designer produces wireframes and visual design for the donation page using the existing system; copywriter produces copy in all three locales. Needs: step 5 signed. Treat as its own mini-round cycle under the existing sign-off limits; the wireframe and visual sign-offs for this page follow the same gates.

7. **Contract first for the donation endpoints (backend-lead).** Add the donation endpoints (create payment intent, webhook receiver, status) to `api/openapi.yaml` and define the Payload donation collections. The frontend lane must not call any endpoint not in the contract. Needs: step 5 signed and step 6 wireframes at least drafted so field names match. Merge the contract before frontend work on the page.

8. **Build the donation page (frontend-lead and backend-lead, parallel after step 7).** Frontend builds templates, components and locale routes against the contract. Backend implements the payment provider integration and webhooks. Linear: one issue per page template, component and endpoint, all linked to the CR. Needs: step 7 merged, step 6 visual design signed off.

9. **QA gate on the preview deployment (qa-auditor).** Run the full audit on the preview URL, including payment flows in test mode, webhook replay, and all three locales. The gate must be green before any client review. Needs: step 8 complete. Fix loops return to the owning lead.

10. **Client review and launch (studio lead, then client).** Client reviews on the same preview URL, max 3 rounds for this addition. Once signed off, roll the donation page into the rolling release and monitor payments and errors. Needs: step 9 green. Scope is locked; any further additions go through a new CR.
````

## B017 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
Here's the plan:

1.  **Root cause:** The client-side `callAdmin` function incorrectly omits the `Content-Type: application/json` header for `POST` requests when no body is explicitly provided, even though the server requires it.
2.  **File to change:** `src/app/hud/hubAdminApi.ts`.
3.  **How to change:** In the `callAdmin` function, modify the `headers` assignment. It must always include `Content-Type: application/json` for `POST`, `PUT`, and `DELETE` requests, regardless of whether a body is passed.
    *   **Original:**
        ```typescript
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        ```
    *   **Modified:**
        ```typescript
        headers: (method === 'POST' || method === 'PUT' || method === 'DELETE')
                   ? { 'Content-Type': 'application/json' }
                   : undefined,
        ```
4.  **How to change (cont.):** Also ensure the `body` is always `JSON.stringify(body)` if a body *might* be sent, or `undefined` for `GET` requests.
    *   **Original:**
        ```typescript
        body: body === undefined ? undefined : JSON.stringify(body),
        ```
    *   **Modified (this handles both explicit `body` and the `undefined` case correctly for server expectations):**
        ```typescript
        body: body !== undefined ? JSON.stringify(body) : (method === 'POST' || method === 'PUT' || method === 'DELETE' ? '{}' : undefined),
        ```
    *   *Self-correction:* A simpler, more robust approach is to always send an empty JSON object `{}` as the body for `POST`/`PUT`/`DELETE` if `body` is `undefined`, while still ensuring the `Content-Type` header is set.

5.  **Revised `callAdmin` modification:**
    ```typescript
    export async function callAdmin<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
      const isSendingBody = method === 'POST' || method === 'PUT' || method === 'DELETE';
      const requestBody = isSendingBody ? JSON.stringify(body ?? {}) : undefined; // Send '{}' if body is undefined for POST/PUT/DELETE
      const headers = isSendingBody ? { 'Content-Type': 'application/json' } : undefined;

      const res = await fetch(`/api/hub/admin${path}`, {
        method,
        headers,
        body: requestBody,
      });
      // ... rest of the function
    }
    ```
6.  **What must NOT change:** The server-side check `if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });` in `src/server/hub-admin.ts` must *not* change.
7.  **Why it must NOT change:** This server-side check is a crucial security measure (CSRF protection) as stated in `src/server/guard.ts`. It ensures that only requests with `application/json` content type, which cannot be forged by simple HTML forms, are processed for state-changing admin actions. Removing it would introduce a security vulnerability.
8.  **Test:** In the Hub UI, navigate to Admin › Senders. Click the "Pause" button next to any sender. Verify that the sender's status changes to "Paused" and no 415 error appears in the browser console. Then click "Resume" and verify the status changes back to "Active".
````

## B018 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Studio Lead — Change Request & Scoping**: Scope the donation page and payment gateway across all 3 locales as a formal Change Request (CR) with budget and schedule impact. *Needs before start: Client request.*
2. **Client — CR Sign-Off**: Client reviews and formally approves the Change Request estimate and scope addition. *Needs before start: Step 1 CR proposal.*
3. **Studio Lead & IA-Architect — Tracking & Information Architecture**: Log Linear issues for the new page template, components, and endpoints. IA-Architect updates the sitemap and content model for donations across the 3 locales. *Needs before start: Step 2 approval.*
4. **Designer & Copywriter — Wireframes, Visual Design & Copy**: Designer creates wireframes and visual UI for the donation flow; Copywriter delivers localized copy for all 3 locales (up to 3 review rounds). *Needs before start: Step 3 updated IA and Linear issues.*
5. **Backend-Lead — API Contract & Schema Definition**: Updates `api/openapi.yaml` with donation/payment endpoints and creates the Payload CMS collections. *Needs before start: Step 4 finalized visual designs and copy.*
6. **Backend-Lead — Payment Integration & Backend Build**: Implements payment gateway integration, webhooks, and endpoints per the updated API contract. *Needs before start: Step 5 updated contract and schemas.*
7. **Frontend-Lead — Template & Component Build**: Builds the localized donation page template and payment components strictly adhering to `api/openapi.yaml`. *Needs before start: Step 5 contract definition and Step 6 backend endpoints available in development.*
8. **QA-Auditor — QA Verification Gate**: Tests the localized donation flows, card payment handling, and error states on the preview deployment; passes the green QA gate. *Needs before start: Steps 6 and 7 deployed to the preview environment.*
9. **Studio Lead & Client — Client Preview Review**: Present the preview deployment URL to the client for acceptance review (max 3 rounds). *Needs before start: Step 8 green QA gate.*
10. **Studio Lead — Merge & Integration Sign-Off**: Secure formal client sign-off for the donation page and merge into the main Phase 4 build pipeline toward Phase 5 QA and Launch. *Needs before start: Step 9 client approval.*
````

## B019 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
**Root cause:** `HubAdmin.tsx` calls `callAdmin('POST', …)` without a body, so `callAdmin` omits the `Content-Type` header. The server's `isJson` CSRF guard in `senderAction` then rejects the request with a 415.

**Plan:**

1. **Fix in `src/app/hud/hubAdminApi.ts` (client side).** Make `callAdmin` always send `Content-Type: application/json` for state-changing methods (POST, PUT, DELETE). When `body` is undefined, send `JSON.stringify({})` (`{}`). Keep GET unchanged, with no header and no body. This fixes pause, resume and revoke, and any other bodyless POST, in one place.

2. **Optional, for clarity:** in `HubAdmin.tsx`, leave the button as is. Do not patch each call site, because that is how the next bodyless action would regress.

3. **Must NOT change: `isJson` in `guard.ts`, or the `isJson` check in `senderAction`.** The requirement is a deliberate CSRF defense. A cross-site HTML form cannot send `application/json`, and a non-simple content type forces a CORS preflight. Do not relax it to accept a missing content type, and do not remove it from the pause, resume or revoke routes. The server is correct and the client is wrong. The CLI works because it sends the header.

4. **Also must NOT change:** the `guard(req, res, 'POST')` method and origin checks, and the server-side body parsing contract. Confirm the handler tolerates a `{}` body, meaning it does not reject unknown or empty JSON and does not require a body at all. If it parses the body strictly, make sure `{}` parses cleanly.

5. **Tests (client unit test, with `fetch` mocked):**
   - `callAdmin('POST', '/senders/x/pause')` calls `fetch` with `headers['Content-Type'] === 'application/json'` and body `'{}'`.
   - `callAdmin('GET', …)` sends no content-type and no body.
   - A POST with a real body still sends that body serialized.

6. **Server regression tests (keep or add):**
   - POST `/senders/x/pause` with `Content-Type: application/json` and body `{}` returns 200 and the sender is paused.
   - The same request with no content type, or with `application/x-www-form-urlencoded` or `text/plain`, still returns 415. This proves the CSRF protection is intact.
   - Resume and revoke behave the same way.

7. **Manual check:** in the Admin › Senders UI, click Pause, then Resume, on `bob-laptop`. Confirm a 200 response and that the row state toggles with no console errors.
````

## B020 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Studio lead: classify and log the request.** A donation page with card payments is not in the signed sitemap or scope, so it is a change request. Write it up with the client's ask and the three locales. Open a Linear change-request issue and hold all work on it until the client approves the estimate. Build lanes continue on signed scope.
   *Needs: nothing.*

2. **ia-architect: scope the page.** Place the page in the sitemap (URL, nav position, locale slugs). Define the content model: donation amounts, frequency, and legal/receipt text. Flag open questions: payment provider, recurring vs one-off, tax receipts, GDPR and PCI implications.
   *Needs: step 1.*

3. **backend-lead: technical estimate.** Draft the new endpoints (for example create payment intent and webhook), the Payload collections (donations, page content), provider integration, and security effort. Confirm that card data never touches our servers (hosted fields or hosted checkout).
   *Needs: step 2.*

4. **frontend-lead, designer and copywriter: estimates.** Frontend-lead estimates the page template, form components and states (error, success, 3DS). The designer estimates the visual design and the extra design round. The copywriter estimates copy for 3 locales, including legal and confirmation text.
   *Needs: step 2. Runs in parallel with step 3.*

5. **Studio lead: consolidated estimate to the client.** Include cost, timeline impact, the client's responsibilities (payment provider account, legal text), and the effect on QA and client review. Get written approval, and add the sitemap amendment to the signed scope.
   *Needs: steps 3 and 4.*

6. **Studio lead: create Linear issues.** Create one issue each for the page template, each component and each endpoint. Link them to the change request.
   *Needs: step 5 approved.*

7. **Designer and copywriter: design and copy for the new page.** Deliver the page in all three locales. Get sign-off on the addition, treated as an amendment to sign-off 3 and counted within its rounds.
   *Needs: step 6. The client supplies legal and receipt requirements.*

8. **backend-lead, then frontend-lead: build.** The backend-lead first adds the endpoints to `api/openapi.yaml` and the Payload collections, then implements them. The frontend-lead builds against the updated contract only, with no invented endpoints, using provider test mode.
   *Needs: step 7 for the design. The contract update must precede the frontend integration.*

9. **qa-auditor: QA gate on the preview deployment.** Cover payment flows (success, decline, 3DS, webhook retries), all 3 locales, accessibility, performance and security. The gate must be green before the client sees it. Fix and re-test as needed.
   *Needs: step 8 on preview.*

10. **Studio lead: client review, then launch.** Run client review on the same preview URL, counting within the 3 rounds. After sign-off, do a rolling release with the live provider keys and a test donation. Monitor payments, webhooks and errors, and update Linear.
    *Needs: step 9 green and client approval.*
````

## B021 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Freeze and triage (studio lead, no dispatch).** Log the donation page request in Linear as a change request, not as build work. It is outside the signed sitemap, so it gets an estimate before anything starts. Input: the client's written request. Output: a CR issue listing the scope, the three locales, and the card-payment requirement.

2. **Impact assessment (ia-architect).** Starts after step 1. Needs the signed sitemap and content model from sign-off 1. Determines the new page template, its position in the sitemap, the donation-specific content types, and the locale fields. Output: a sitemap delta and content-model delta, reviewed by the studio lead.

3. **Estimate and client approval (studio lead).** Starts after step 2. Needs the sitemap delta, the rough effort from frontend-lead and backend-lead (a quick sizing pass, dispatched in parallel), and a payment-provider decision noted as a risk. Output: a priced change request. Build work on the donation page does not begin until the client approves the CR in writing.

4. **Scope the change to the existing sign-offs (studio lead).** Starts after step 3 approval. Needs the approved CR. Decide which new artifacts go through the normal gates: wireframe for the donation page (sign-off 2 round), visual design and copy for three locales (sign-off 3 rounds). Create one Linear issue per page template, component, and endpoint: donation page template, donation form component, locale-specific copy items, and the donation/payment endpoints.

5. **Wireframe and design the donation page (designer, copywriter).** Starts after step 4. Needs the approved CR, the existing design system, and the sitemap delta. Copywriter produces copy in all three locales. Output goes to client sign-off 2-style review for this page only, with its own round limit.

6. **Contract first (backend-lead, then frontend-lead reviews).** Starts after the wireframe and copy for the donation page are signed off. Needs the approved form fields and the payment-provider choice. Backend-lead adds the donation and payment-intent endpoints to `api/openapi.yaml` and the Payload collections (donations, locale fields) before any frontend code touches them. Frontend-lead must not invent endpoints; if one is missing from the contract, it goes back to backend-lead.

7. **Build in parallel (frontend-lead and backend-lead).** Starts after step 6 merges the contract. Frontend-lead builds the donation template and form component against the contract. Backend-lead builds the payment integration, webhooks, and collections. Both lanes update their Linear issues as they go. Card data must be handled by the payment provider's hosted fields or SDK, never stored or logged by our code, and this needs a security check before QA.

8. **QA gate on preview (qa-auditor).** Starts after step 7 is complete and deployed to the preview. Needs the donation page on all three locales, test payments in sandbox mode, and the accessibility and security checks. The gate must be green before any client sees the page. A red gate sends the issue back to the owning lane.

9. **Client review on the preview URL (studio lead).** Starts after QA is green. Needs the preview link and a short test script. The donation page counts against the CR's own review rounds (max 3). Log each round in Linear.

10. **Launch and monitoring (studio lead, frontend-lead, backend-lead).** Starts after client sign-off on the CR. Needs the payment provider in live mode with keys set in the production environment only, and a rolling release that puts the donation page in behind a flag so the other pages are not blocked. Monitor payment success rate, webhook failures, and error logs for the first release window, then close the CR and its Linear issues.
````

## B022 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1.  **Root Cause:** The client-side `callAdmin` function fails to send the `Content-Type: application/json` header for `POST` requests when no request body is provided, which the server-side security guard explicitly requires.
2.  **File to change:** `src/app/hud/hubAdminApi.ts`.
3.  **How to change:** Modify the `callAdmin` function to always include `Content-Type: application/json` for `POST` (and `PUT`, `DELETE`) requests, even when `body` is `undefined`.
4.  **Specific change in `callAdmin`:** Replace the `headers` assignment with logic that sets `Content-Type: application/json` conditionally based on the method, not just the presence of a body.
    ```typescript
    // Inside callAdmin function:
    let headers: HeadersInit | undefined = undefined;
    if (method !== 'GET' && method !== 'HEAD') { // Likely POST, PUT, DELETE
      headers = { 'Content-Type': 'application/json' };
    }
    // If a body is provided AND we already have headers (e.g. from above), or no headers yet
    // If we want to allow other content types in the future, this would need to be more complex.
    // For now, assuming all non-GET/HEAD methods require application/json.
    // The existing logic for headers was `body === undefined ? undefined : { 'Content-Type': 'application/json' }`
    // This can be simplified to always include it for non-GET methods.

    // Proposed change:
    const fetchOptions: RequestInit = { method };
    if (method !== 'GET' && method !== 'HEAD') {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
    }
    if (body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(`/api/hub/admin${path}`, fetchOptions);
    ```
5.  **What must NOT change:** The server-side `isJson` check in `src/server/guard.ts` and the corresponding check in `src/server/hub-admin.ts` must *not* be removed or altered. These checks are crucial Cross-Site Request Forgery (CSRF) protection mechanisms, ensuring that only requests with the correct `Content-Type` header (which a malicious HTML form cannot easily forge) are accepted.
6.  **Test to prove the fix:** Navigate to Admin › Senders on the hub UI, click "Pause" for an active sender, and verify that the sender's status changes to paused without any browser console errors. Then, click "Resume" for the paused sender and verify it becomes active.
````

## B023 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. Root cause: `change('POST', …)` in HubAdmin.tsx calls `callAdmin` with no body, so `headers` is `undefined` and no `Content-Type` is sent; the server's `isJson` guard in `senderAction` then rejects the request with 415 before any work happens. The CLI works because it sends a JSON body (or otherwise sets the header).

2. Change `src/app/hud/hubAdminApi.ts` so that `callAdmin` always sends `Content-Type: application/json` for POST/PUT, and sends an explicit JSON body (`{}` when the caller passes none). Keep the signature and return shape unchanged. Do this in one place rather than patching each button, so every state-changing call through the helper is covered.

3. Do not modify `HubAdmin.tsx`'s call sites beyond what is needed. The `change('POST', '/senders/…/pause')` calls are correct as written; the bug is the helper dropping the body/header for bodyless POSTs.

4. Do not weaken or remove the `isJson` check in `src/server/guard.ts` or the 415 check in `senderAction`. The comment there states the purpose: a cross-site HTML form can only send form or text bodies, so requiring `application/json` is the CSRF defense for admin routes. Removing it would reopen cross-site triggering of pause/resume/revoke.

5. Do not change the CLI path (`flow-tower token pause`) or the server's route handling, paths, or response shapes. The CLI already works and must keep working.

6. Optionally, make the server side consistent: confirm `guard(req, res, 'POST')` still enforces method and origin checks as before. No server edit is required.

7. Add a unit test for `callAdmin` (mocking `fetch`) asserting that a POST with no body sends `Content-Type: application/json` and a body of `{}`, and that a GET sends no body and no content-type header.

8. Add an integration test on `senderAction` (or the admin router) asserting: POST pause/resume with the JSON header returns 200; POST with `Content-Type: application/x-www-form-urlencoded` still returns 415 (guard regression check); and a cross-site form-style POST without JSON is rejected. Run the existing CLI token-pause test to confirm it still passes.
````

## B024 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
1. **Root cause:** The Pause/Resume button calls `change('POST', path)` with no body, so `callAdmin` omits the `Content-Type` header, and the server's `isJson` check in `senderAction` rejects the request with 415 before it reaches the handler.

2. **Client fix in `src/app/hud/HubAdmin.tsx`:** Make the Pause and Resume actions send a JSON body, for example `{}`, by passing it through `change(...)`. Keep the existing `encodeURIComponent(s.id)` path construction unchanged.

3. **Optional hardening in `src/app/hud/hubAdminApi.ts`:** In `callAdmin`, default `body` to `{}` for `POST` and `PUT` so every state-changing call sends `Content-Type: application/json`. This prevents the same 415 for any future no-body POST. Leave `GET` and `DELETE` behavior as is.

4. **Do not change `src/server/guard.ts` or the `isJson` check in `senderAction`.** The JSON requirement is the CSRF defense: a cross-site HTML form cannot send `application/json` without a CORS preflight. Relaxing it to accept missing or form content types would reopen the admin-action forgery hole.

5. **Do not change the server's pause, resume, or revoke handlers or their response shape.** The bug is purely on the client request side, and the CLI already works against the same handlers.

6. **Do not change the CLI (`flow-tower token pause`).** It is not affected and is a useful reference for the expected request shape.

7. **Test (frontend):** Add a test for `HubAdmin` that clicks Pause and Resume and asserts the outgoing `fetch` has `method: 'POST'`, `Content-Type: application/json`, and a parseable JSON body. Cover both paused and unpaused sender states.

8. **Test (server, regression guard):** In `hub-admin` tests, assert that `POST /senders/:id/pause` with `application/json` and body `{}` returns 200, and that the same request with `application/x-www-form-urlencoded` or no content type still returns 415. The second assertion locks in the CSRF protection so the fix cannot silently weaken it.
````

## B025 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
1. **Studio Lead — Change Request (CR) & Scope Impact Assessment**
   * *Prerequisites:* Client request received.
   * *Action:* Log the donation page as an out-of-scope Change Request. Coordinate with `ia-architect`, `designer`, `copywriter`, `backend-lead`, and `frontend-lead` to estimate budget, timeline, and impact across all three locales. Submit CR to the client for formal approval before any work begins.

2. **Studio Lead — Linear Project Setup**
   * *Prerequisites:* Client signs off on the Change Request.
   * *Action:* Create Linear issues for the new page template, UI components, payment endpoints, and content collections across the three locales to keep tracking current.

3. **IA-Architect — Sitemap & Data Model Update**
   * *Prerequisites:* CR approved and Linear issues created.
   * *Action:* Update the sitemap and define the content/donation data model (fields, payment states, multi-locale structures).

4. **Designer & Copywriter — Wireframes, Visual Design, & Localized Copy**
   * *Prerequisites:* IA updates completed.
   * *Action:* `designer` creates wireframes and visual UI components for the donation form and payment states. `copywriter` produces donation copy localized for all three locales.

5. **QA-Auditor & Studio Lead — Design/Copy Sign-off Gate**
   * *Prerequisites:* Design and localized copy drafted.
   * *Action:* `qa-auditor` verifies accessibility and UI completeness against design standards. Studio lead secures client sign-off (amendment to sign-off 3) for the donation page design and copy.

6. **Backend-Lead — API Contract & Payload Collection Setup**
   * *Prerequisites:* Design/copy sign-off completed.
   * *Action:* Update `api/openapi.yaml` with the payment/donation endpoints, implement payment processor integration/webhooks, and configure the new Payload CMS collections for the three locales.

7. **Frontend-Lead — Frontend Implementation**
   * *Prerequisites:* `api/openapi.yaml` updated and committed by `backend-lead`.
   * *Action:* Build the donation page template and payment components against the OpenAPI contract and Payload CMS collections across the three locales.

8. **QA-Auditor — QA Gate on Preview Deployment**
   * *Prerequisites:* Backend and frontend lanes merged to preview deployment.
   * *Action:* Perform end-to-end QA (card payment processing, error states, multi-locale display, responsive design); confirm the QA gate is completely green.

9. **Client Review & Sign-Off**
   * *Prerequisites:* Green QA gate on the preview URL.
   * *Action:* Client reviews the live donation page on the preview deployment (max 3 rounds) and provides final sign-off.

10. **Frontend-Lead & Backend-Lead — Deployment & Monitoring**
    * *Prerequisites:* Client sign-off and final QA approval.
    * *Action:* Deploy via rolling release to production and monitor payment transaction logs and system health.
````

## B026 · planner/web-change-request: Plan a late scope change

### Task rubric

```regex
change request
estimate
backend[- ]lead[\s\S]*(openapi|API contract|contract)|(openapi|API contract|contract)[\s\S]*backend[- ]lead
designer|copywriter
QA
Linear
```

```must-not
frontend[- ]lead (adds|writes|creates) (the |an? )?(new )?endpoint
```

Rubric (blind scorer, 0-10):
- 3 points: treats it as a change request with an estimate the client approves before any work, since it is outside the signed sitemap.
- 3 points: order is right: client approval → design/copy for the page (a new sign-off round) → backend lead extends `api/openapi.yaml` (payment endpoint) before the frontend builds against it → QA green before the client reviews.
- 2 points: names the right specialists, and the Linear issues (page template, components, endpoint).
- 2 points: no invented phases or rules; at most 10 steps.

### Answer

````text
**Plan: donation page change request**

1. **Studio lead: log the change request.** No work starts before this.
   - The donation page is outside the signed sitemap, so it becomes a change request (CR).
   - Create a Linear CR issue that states the scope: one page template, a donation form component, payment endpoints, three locales and card payments.
   - Ask the client up front about decisions that change the estimate: which payment provider (e.g. Stripe), one-off or recurring gifts, currencies per locale, receipts or tax certificates, and who owns the merchant account.
   - *Needs:* the client's request in writing.

2. **Studio lead with backend-lead, designer and copywriter: estimate the CR.**
   - Each specialist sizes their part.
   - Backend-lead also flags payment risks: use the provider's hosted fields so card data never touches our servers (this keeps PCI scope small), webhooks, refunds and failure states.
   - Send the estimate and its effect on the timeline to the client.
   - *Needs:* the answers from step 1.

3. **Client: approve the CR.**
   - Get written approval of the estimate.
   - Confirm that this approval adds the page to the signed scope.
   - Confirm that the current build lanes and launch date continue unchanged, or how they move.
   - *Needs:* the estimate from step 2. Nothing below starts until this is done.

4. **ia-architect: add the page to the information architecture.**
   - Add the donation page to the sitemap and content model in the three locales.
   - Model the donation content (amounts, campaign text, legal text) as Payload collection changes.
   - Get a mini sign-off from the client on this sitemap addendum.
   - Open Linear issues for the page template and each component.
   - *Needs:* the approved CR.

5. **designer and copywriter: design and write the page, in parallel.**
   - Designer: wireframe and visual design of the page and every form state (amount selection, card entry, processing, success, declined, error), reusing the existing design system.
   - Copywriter: all copy in the three locales, including legal and consent text and receipt emails.
   - Run this as a scoped sign-off for this page only, max 3 rounds. Sign-off 3 is not reopened for the rest of the site.
   - *Needs:* step 4.

6. **backend-lead: add the endpoints to the API contract first.**
   - Add the donation endpoints to `api/openapi.yaml`, for example: create payment intent, provider webhook, donation status.
   - Add the Payload collections for donations and campaigns.
   - Integrate the provider in test mode: secrets in environment variables, webhook signature check, idempotency on payment requests.
   - Open one Linear issue per endpoint.
   - *Needs:* step 4 to start the contract. The provider decision from step 1 to start the integration.

7. **frontend-lead: build the page and form.**
   - Build only against the endpoints already published in the contract.
   - If something is missing, request it from backend-lead. Never add an endpoint yourself.
   - Embed the provider's hosted card fields, all three locales and localized currency formatting.
   - *Needs:* the merged contract from step 6 and the signed design and copy from step 5.

8. **qa-auditor: run the QA gate on the preview deployment.**
   - Run test cards for success, decline and 3-D Secure.
   - Check that webhooks reconcile with donation records and that refunds and errors behave correctly.
   - Check all three locales, accessibility of the form, performance, and that no card data appears in our logs or database.
   - The gate must be green before the client sees the page.
   - *Needs:* steps 6 and 7 deployed to the preview.

9. **Client: review on the same preview URL.**
   - Max 3 rounds.
   - Anything new raised here goes back to step 1 as another CR.
   - *Needs:* a green QA gate.

10. **Studio lead with backend-lead: launch.**
    - Switch the provider to live keys and run a live smoke test with a small real donation, then refund it.
    - Ship in the rolling release.
    - Monitor payment success rate, webhook failures and errors.
    - Close the Linear issues.
    - *Needs:* client approval from step 9 and the live merchant account active.
````

## B027 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

### Task rubric

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

### Answer

````text
**Root cause:** The Pause/Resume button calls `callAdmin('POST', path)` with no body, so `callAdmin` omits the `Content-Type` header. `senderAction` in `hub-admin.ts` requires `application/json` on every state-changing route and returns 415. The CLI works because it sends the header.

**Plan**

1. **Fix on the client, in `src/app/hud/hubAdminApi.ts`.** Change `callAdmin` so every non-GET request (POST, PUT, DELETE) always sends `Content-Type: application/json`. When `body` is undefined, send `body: '{}'`. GET requests stay unchanged, with no header and no body. This fixes pause, resume, revoke and any other bodyless admin POST in one place.

2. **Leave `HubAdmin.tsx` as it is.** The button call is correct. Do not patch each call site with `{}`, because other bodyless actions such as revoke would stay broken and the same bug would come back.

3. **Do NOT change `guard.ts` or `isJson`, and do not remove or loosen the `isJson` check in `senderAction` (`hub-admin.ts`).** The check is a deliberate CSRF defense. A cross-site HTML form can only send form or text content types, so requiring `application/json` forces a CORS preflight. Relaxing it for bodyless POSTs would let any web page pause or revoke senders.

4. **Do not make the server accept a missing content-type or an empty body as a special case.** This is the same CSRF reasoning as step 3, because a bodyless form POST is exactly the attack the check blocks.

5. **Check that the server tolerates the `{}` body.** Confirm that `senderAction` and any shared body parser accept `{}` for pause, resume and revoke, and that none of them reject unexpected keys or empty-object payloads. Change nothing if they already do.

6. **Add a client unit test for `callAdmin`.** Mock `fetch` and check the following:
   - `callAdmin('POST', '/senders/x/pause')` sends the header `Content-Type: application/json` and the body `'{}'`.
   - A POST with a body still sends the JSON-serialized body.
   - A GET sends no `Content-Type` header and no body.

7. **Add or keep server tests.**
   - A POST to `/senders/:id/pause` with `Content-Type: application/json` and body `{}` returns 200 and the sender becomes paused. The same holds for resume.
   - A POST with no content-type, or with `application/x-www-form-urlencoded` or `text/plain`, still returns 415. This regression test proves the CSRF protection stays in place.

8. **Verify manually.** In the hub UI, click Pause and then Resume on a sender. Both should return 200 and the status should toggle, and the console should show no 415. Confirm that `flow-tower token pause` still works.
````
