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

## B002 · planner/web-change-request: Plan a late scope change

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

## B003 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
**Root cause:** The Pause/Resume button calls `callAdmin('POST', path)` with no body, so `callAdmin` omits the `Content-Type` header. The server's `senderAction` requires `application/json` on every state-changing route (a CSRF defense) and returns 415. The CLI sends the header, so it works.

**Plan**

1. **Fix on the client, in `src/app/hud/hubAdminApi.ts`.** For non-GET requests (POST/PUT/DELETE), always send `Content-Type: application/json`. When `body` is undefined, send the body `{}` (`JSON.stringify(body ?? {})`). GET requests keep no header and no body. This fixes pause, resume, and revoke, and any other bodyless POST, in one place, so `HubAdmin.tsx` doesn't need per-button changes.

2. **Leave the `HubAdmin.tsx` button unchanged.** The call site is correct. The helper should be the one to guarantee a valid JSON request.

3. **Do NOT change `guard.ts`, `isJson`, or the `isJson` check in `hub-admin.ts`.** Relaxing it for bodyless requests would reopen the cross-site HTML form hole. A form can POST with no body or a form-encoded content type, and that is exactly what the check blocks. Don't loosen the check to "allow missing content-type" and don't add exemptions for the senders routes.

4. **Check that the server tolerates `{}`.** Confirm that `senderAction` either ignores the body or parses `{}` without error (for example, no schema that rejects an empty object). If it parses the body strictly, adjust only the handler's parsing so that an empty object is accepted. The 415 check stays as it is.

5. **Audit the other callers of `callAdmin`** (grep) for POST/PUT/DELETE calls that pass no body. They had the same latent bug and are now covered. Make sure none relies on getting no body.

**Tests**

6. **Unit test for `callAdmin`, with `fetch` mocked:**
   - `callAdmin('POST', '/senders/x/pause')` sends the header `Content-Type: application/json` and the body `{}`.
   - A POST with a body sends that body unchanged, with the same header.
   - A GET sends neither header nor body.

7. **Server integration test (regression guard):**
   - A POST to `/senders/bob-laptop/pause` with `application/json` and `{}` returns 2xx and sets `paused`. Then `resume` clears it.
   - A POST with no content-type, or with `application/x-www-form-urlencoded` or `text/plain`, still returns 415. This proves the CSRF protection is intact.

8. **Manual check.** In the hub UI, click Pause, then Resume, on a sender. Confirm there is no 415 in the console and the row state toggles. Also confirm that `flow-tower token pause` still works.
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

## B005 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
Here is the plan to address the author's requests:

1.  **Outliner** revises the outline to merge chapters 6 and 7 and creates a new outline for the "pricing your first course" chapter, integrating it after chapter 11 (adjusting subsequent chapter numbering).
2.  **Author** reviews and signs off on the updated outline for the merged chapter (ex-6/7) and the new chapter.
3.  **Chapter Writer** pauses drafting of chapters 10-12.
4.  **Chapter Writer** revises the previously drafted chapters 6 and 7 into a single, merged chapter based on the new outline.
5.  **Chapter Writer** drafts the new "pricing your first course" chapter.
6.  **Chapter Writer** resumes drafting chapters 10-12 (if not completed), ensuring no more than 4 chapters are actively being drafted at once.
7.  **Outliner** confirms all chapter outlines are author-approved and the chapter structure is finalized before any developmental editing begins.

Before drafting resumes beyond the immediate tasks: the revised outline must be signed off by the author for both the merged chapter and the new chapter.
````

## B006 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Pause and hold.** Tell the chapter writers on 10–12 to stop at their current state and save work. Do not accept new output, and do not start the new pricing chapter. Chapters 1–9 stay as drafted.

2. **Outliner revises the outline.** Merge chapters 6 and 7 into one chapter. Insert "Pricing your first course" after current chapter 11. Renumber everything and produce an old-to-new chapter map, a list of cross-references that change, and a note on any figures affected. The total stays at 14.

3. **Author signs off.** The author re-signs the revised outline. Check whether the style sheet is affected and re-sign it if so. Nothing downstream moves until this sign-off exists.

4. **Drafting resumes, capped at 4 sessions.** Start with the merged chapter, redrafted from the existing 6 and 7 drafts under the new plan. Then continue 10–12 under their new numbers, and draft the pricing chapter from the signed outline. Run no more than four sessions at once, so the fifth item waits for a slot.

5. **Dev editor writes one editorial letter** on the complete 14-chapter manuscript, after all chapters are drafted. Do not run it on the old structure.

6. **Line edit, then copy edit against Vale rules,** in the normal order, across the full manuscript. The copy editor also fixes renumbered cross-references.

7. **Fact-check the whole manuscript,** with extra attention to the new pricing chapter, since pricing claims are time-sensitive and unsourced so far. Alt-text writer then covers all figures, including any whose chapter numbers changed.

8. **Layout, then KDP upload.** Before upload, confirm that the outline version and author sign-off are recorded in the project file, and that the chapter map matches the final book.
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
Here is the plan for adding the donation page:

1.  **Change Request & Initial Estimation:**
    *   **Who:** Studio Lead
    *   **What:** Initiate a formal change request. Gather high-level requirements for the donation page (card payments, 3 locales) to provide a preliminary estimate for client approval.
    *   **Needs before starting:** Client request for the donation page.

2.  **Detailed Requirements & Scope Definition (Mini-Discovery):**
    *   **Who:** ia-architect, backend-lead, designer, copywriter, Studio Lead (to coordinate)
    *   **What:** Define detailed requirements, including:
        *   Payment gateway integration needs (backend-lead).
        *   Sitemap addition for the new page (ia-architect).
        *   Content model for the donation page (amount options, legal text, etc.) in Payload (ia-architect, copywriter).
        *   Functional requirements for the page (form fields, success/error states).
        *   Technical debt/impact assessment.
    *   **Needs before starting:** Client approval of the preliminary estimate from Step 1.

3.  **Updated Estimate & Sign-off 1 (Change Request):**
    *   **Who:** Studio Lead, based on input from all specialists in Step 2.
    *   **What:** Present a refined estimate and proposed scope (including sitemap changes and content model) for the new donation page to the client for sign-off. This will be an *ad-hoc* sign-off specific to this change, mirroring "sign-off 1" for the new functionality.
    *   **Needs before starting:** Completed detailed requirements from Step 2.

4.  **Wireframes & Sign-off 2 (Change Request):**
    *   **Who:** designer, ia-architect
    *   **What:** Create wireframes for the donation page, including mobile/desktop layouts and interaction flows. Present to client for review and an *ad-hoc* sign-off. (Max 2 rounds)
    *   **Needs before starting:** Signed-off scope and content model from Step 3.

5.  **Visual Design & Copywriting & Sign-off 3 (Change Request):**
    *   **Who:** designer, copywriter
    *   **What:** Develop the visual design and write all copy (for all 3 locales) for the donation page based on approved wireframes. Present to client for review and an *ad-hoc* sign-off. (Max 3 rounds)
    *   **Needs before starting:** Signed-off wireframes from Step 4.

6.  **Linear Issue Creation & API Contract Definition:**
    *   **Who:** Studio Lead (delegating to leads), backend-lead
    *   **What:**
        1.  Create Linear issues for the new page template, components, and backend endpoints/collections.
        2.  Backend-lead updates `api/openapi.yaml` with new endpoints for payment processing and any new Payload collections.
    *   **Needs before starting:** Signed-off visual design and copy from Step 5.

7.  **Backend Development (Payment Gateway Integration & API):**
    *   **Who:** backend-lead
    *   **What:** Implement payment gateway integration, develop new API endpoints as per `api/openapi.yaml`, and create Payload collections.
    *   **Needs before starting:** Signed-off `api/openapi.yaml` and Payload collection definitions (from Step 6).

8.  **Frontend Development:**
    *   **Who:** frontend-lead
    *   **What:** Build the donation page UI and integrate with the new backend API endpoints.
    *   **Needs before starting:** Implemented backend endpoints and Payload collections (from Step 7) and signed-off visual design (from Step 5).

9.  **QA & Client Review:**
    *   **Who:** qa-auditor, Studio Lead (for client review)
    *   **What:**
        1.  QA-auditor tests the new donation page on the preview deployment (QA gate must be green).
        2.  Client reviews the donation page on the same preview URL. (Max 3 rounds)
    *   **Needs before starting:** Completed frontend and backend development for the donation page (from Steps 7 & 8).

10. **Release & Monitoring:**
    *   **Who:** Studio Lead, frontend-lead, backend-lead
    *   **What:** Include the donation page in the next rolling release. Monitor performance and error logs post-launch.
    *   **Needs before starting:** Successful client review and QA sign-off from Step 9.
````

## B008 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Publishing Lead**: Pause drafting on active sessions (chapters 10–12) and halt downstream work until the outline revision is finalized.
2. **Outliner**: Update the manuscript outline to merge chapters 6 and 7 into a single chapter, insert the new "Pricing Your First Course" chapter after chapter 11, and renumber subsequent chapters accordingly.
3. **Author**: Review and sign off on the revised outline and chapter plan (mandatory before drafting can resume).
4. **Chapter Writer**: Merge the drafted texts of chapters 6 and 7 according to the approved outline.
5. **Publishing Lead**: Reassign and schedule drafting sessions under the 4-session maximum limit.
6. **Chapter Writer**: Resume drafting remaining chapters (including the new pricing chapter and remaining uncompleted chapters) up to 4 concurrent sessions.
7. **Developmental Editor**: Conduct the whole-manuscript developmental edit and issue the single editorial letter once all chapters are fully drafted.
8. **Line Editor, Copy Editor (Vale rules), Fact-Checker, Alt-Text Writer, Layout Specialist**: Complete downstream production sequentially, ending with KDP upload.
````

## B009 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
Here's the plan to fix the bug:

1.  **Root Cause**: The client-side `callAdmin` function in `src/app/hud/hubAdminApi.ts` only sends the `Content-Type: application/json` header when a `body` argument is explicitly provided. Admin actions like pause/resume are called without a body, causing the server to reject the request with a 415 error.
2.  **File to change**: `src/app/hud/hubAdminApi.ts`.
3.  **How to change**: Modify the `callAdmin` function to always send `Content-Type: application/json` for `POST`, `PUT`, and `DELETE` requests, regardless of whether a `body` is provided. If no `body` is explicitly passed, send an empty JSON object (`{}`) as the request body.
4.  **Specific code change in `src/app/hud/hubAdminApi.ts`**:
    *   Change the `headers` and `body` assignment logic.
    *   Example:
        ```typescript
        export async function callAdmin<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
          const isStateChangingMethod = ['POST', 'PUT', 'DELETE'].includes(method);
          const requestBody = body === undefined && isStateChangingMethod ? {} : body; // Use empty object for state-changing methods if body is undefined

          const res = await fetch(`/api/hub/admin${path}`, {
            method,
            headers: isStateChangingMethod
              ? { 'Content-Type': 'application/json' }
              : undefined, // Always send JSON header for state-changing methods
            body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
          });
          // ... rest of the function
        }
        ```
5.  **What must NOT change**: The server-side `isJson` guard in `src/server/guard.ts` and its application in `src/server/hub-admin.ts` must *not* change.
6.  **Why it must not change**: This check is a crucial security measure (CSRF protection) to prevent cross-site HTML forms from triggering administrative actions. Removing or weakening it would introduce a severe security vulnerability.
7.  **Test to prove the fix**:
    *   Manually navigate to the Hub Admin UI.
    *   Click "Pause" on an active sender.
    *   Verify the sender's status changes to "Paused" in the UI.
    *   Click "Resume" on the paused sender.
    *   Verify the sender's status changes back to "Active" in the UI.
    *   Confirm no 415 errors appear in the browser console for these actions.
8.  **(Optional but good practice)** Add a unit test for `callAdmin` to ensure it sends the correct headers and body for various scenarios (e.g., `POST` with no body, `POST` with a body, `GET`).

**Note**: The current solution assumes `change` is a direct wrapper around `callAdmin`. If `change` has its own logic, it might need adjustment to pass `body: {}` explicitly to `callAdmin`. However, the proposed change to `callAdmin` directly fixes the root cause regardless of how `change` is implemented.
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
1. **Root cause:** The server enforces `Content-Type: application/json` via `isJson(req)` on all state-changing admin routes as a CSRF protection measure, but `HubAdmin.tsx` calls `change` (and thus `callAdmin`) without a body, causing `callAdmin` to omit the `Content-Type` header entirely.
2. **What must NOT change:** Do not relax or remove the `isJson(req)` check in `src/server/guard.ts` or `src/server/hub-admin.ts`; doing so would weaken the CSRF defense that prevents malicious HTML forms from triggering admin actions.
3. **File to change (`src/app/hud/HubAdmin.tsx`):** Update the call to pass an empty JSON body payload (e.g. `{}`), or update the UI handler to provide `{}` as the `body` argument: `change('POST', \`/senders/\${encodeURIComponent(s.id)}/\${s.paused ? 'resume' : 'pause'}\`, {})`.
4. **File to change (`src/app/hud/hubAdminApi.ts`):** Alternatively (and preferably to fix all bodyless mutating requests consistently), ensure `callAdmin` sets `headers: { 'Content-Type': 'application/json' }` and `body: JSON.stringify(body ?? {})` for mutating HTTP methods (`POST`, `PUT`, `DELETE`).
5. **Verification test (manual):** Log in to the hub admin UI, navigate to Admin › Senders, click "Pause" (and "Resume") on a sender, and verify that the request succeeds with HTTP 200/204 and no 415 error in the browser console.
6. **Automated test:** Add/run an integration test targeting `POST /api/hub/admin/senders/:id/pause` verifying that requests sent from the client helper successfully include the `Content-Type: application/json` header and return a 2xx response.
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
1. **Root Cause**: `callAdmin` only sends the `Content-Type: application/json` header when a `body` argument is provided, but `HubAdmin.tsx` invokes the POST pause/resume action without a body, causing the server's CSRF-protection `isJson` check to reject the request with HTTP 415.
2. **Files to Change**:
   - `src/app/hud/HubAdmin.tsx`: Pass an empty object `{}` as the body argument in the `change` call for pause/resume (or adjust `change('POST', ..., {})`).
   - Alternatively, `src/app/hud/hubAdminApi.ts`: Ensure mutating methods (`POST`, `PUT`) always send headers `{ 'Content-Type': 'application/json' }` and a body (e.g., `JSON.stringify(body ?? {})`) even if `body` is undefined. (Note: prefer `src/app/hud/HubAdmin.tsx` or `src/app/hud/hubAdminApi.ts` ensuring `Content-Type: application/json` is sent on admin mutation calls).
3. **What Must NOT Change**:
   - `src/server/guard.ts` and `src/server/hub-admin.ts` must NOT be relaxed to allow missing `Content-Type: application/json`.
   - Reason: Requiring `application/json` on state-changing admin routes is a critical CSRF defense preventing cross-site HTML forms from triggering admin actions.
4. **Verification / Test**:
   - In the browser/HUD, navigate to Admin › Senders, click "Pause" and "Resume", and verify that requests succeed with HTTP 200/204 rather than 415, and the sender status updates.
   - Run existing automated tests and add/verify an integration test ensuring POST requests to `/api/hub/admin/senders/:id/pause` and `resume` succeed when called from the client API helper.
````

## B013 · planner/web-change-request: Plan a late scope change

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

## B015 · planner/web-change-request: Plan a late scope change

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

## B017 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze drafting now.** Chapters 10-12 are in progress under the old outline. Pause the chapter-writer sessions for 10-12 (and anything touching 6-7 or the chapter 11/12 boundary) so no more text is produced against a plan that is about to change. Chapters already finished stay on file, unchanged.

2. **Outliner revises the plan as a change proposal, not a silent edit.** The outliner drafts a revised outline showing: chapters 6 and 7 merged into one chapter (with the combined scope, word-count target, and what is cut or relocated), and a new "Pricing your first course" chapter inserted after current chapter 11. Renumbering is shown explicitly (old 8-14 become new numbers, with a cross-reference table). The proposal states the impact on 10-12 and on any chapter that references 6, 7, or the later numbering.

3. **Author signs off on the revised outline and style sheet.** Nothing proceeds until the author signs the new version. This is required because any chapter-plan change needs the author's sign-off again. Get the sign-off in writing, with the version number and date.

4. **Triage the drafted material against the new plan.** Chapter writer (or outliner with the writer) maps the existing text of chapters 6, 7, and 8-11 onto the new structure. Output: a list of what carries over, what must be rewritten to merge 6 and 7, and what is missing for the pricing chapter. Decide whether drafted chapters 10-11 need revision or only renumbering. Any text that is kept but changed is re-reviewed.

5. **Resume drafting under the new outline, within the four-session limit.** Once signed, restart sessions for: the merged 6/7 chapter (rewritten from the combined material), the new pricing chapter, and the in-progress 10-12 (now renumbered). Keep no more than 4 chapter sessions running at once. Chapters 1-5 and 8-9 are renumbered only if affected, and their text is not regenerated.

6. **Developmental edit on the whole manuscript.** Dev editor writes one editorial letter covering the full restructured book, once all chapters are drafted. It checks flow across the merge and the new pricing chapter, and that the pricing chapter's placement after old 11 makes sense for the reader's arc.

7. **Downstream passes run in the usual order, per chapter.** Line edit → copy edit (Vale rules) → fact-check (the pricing chapter needs current platform and pricing facts sourced) → alt text for any figures. Any chapter whose text changed after its line edit goes back through the affected steps.

8. **Layout and KDP upload last, with a final outline check.** Before layout, confirm the final chapter list matches the author-signed outline version (numbering, titles, cross-references). Then layout, then KDP upload. Record the outline version in the release notes so the book on KDP traces to the signed plan.
````

## B018 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze affected work (me):** Pause new drafting on chapters 6, 7, 11 and the new chapter. Chapters 10 and 12 can finish, but only if the outliner confirms the changes don't touch them. Draft sessions stay at 4 or fewer. Chapters 1-5, 8 and 9 are unaffected, so they continue and can enter review later.

2. **Impact check (outliner):** Draft a revised outline covering four points:
   - Merged 6+7 scope: what is kept, cut and reordered, and how the old drafts are reused.
   - Placement and brief for "Pricing your first course" after ch. 11.
   - Renumbering: the total becomes 14 - 1 + 1 = 14, and chapters 8-14 shift.
   - Knock-on effects on cross-references, the style sheet, and the chapter 10-12 drafts in progress.

3. **Author sign-off (me, with the author):** Send the revised outline and style-sheet changes to the author for explicit approval. Nothing in the chapter plan changes until they sign. If they request revisions, the outliner iterates and the author signs again.

4. **Resume drafting (me → chapter writer):** After sign-off, the chapter writer starts these sessions:
   - Merge 6+7, reusing the existing drafts.
   - Draft the new pricing chapter.
   - Continue 10-12, adjusted for any renumbering.
   
   I schedule these so that no more than 4 sessions run at once. For example, the merge and the pricing chapter start first, and the others fill the remaining slots as they free up.

5. **Hold the editing pipeline (me):** The developmental edit is one letter on the whole manuscript, so it starts only when all chapters are drafted, including the merged chapter and the new one. No downstream stage begins on a partial manuscript.

6. **Developmental edit (dev editor):** One editorial letter on the full 14-chapter manuscript. The chapter writer revises based on it. If the letter requires plan changes, they go back through the outliner and the author again.

7. **Sequential polish (line editor → copy editor → fact-checker → alt-text writer):** Run in this order on the revised text. The copy editor applies the Vale rules. The fact-checker gives extra attention to the new pricing chapter, which has the most new claims and figures. The alt-text writer covers any new or changed figures.

8. **Layout and upload (layout → me):** Layout works from the final renumbered manuscript. I check the table of contents, cross-references and figure numbers, then approve the KDP upload.
````

## B019 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze affected work (me):** Pause new drafting sessions for chapters 6, 7, 11, and 12, plus any chapter whose content depends on them. Chapters 10-12 are in progress, so tell their writers to finish only the parts that won't change. Chapters 1-5, 8, 9, and 10 can continue. The limit of 4 concurrent sessions still applies.

2. **Impact check (outliner):** Compare the request with the signed outline and style sheet. Identify what the merge of 6 and 7 changes: overlap, cuts, the new chapter order, the renumbered chapters (14 becomes 14 or 13 depending on the merge and the addition), cross-references, and the figures. Identify where "pricing your first course" fits after chapter 11 and which parts of chapters 11-12 and the intro/conclusion it touches.

3. **Revised outline (outliner):** Produce a revised outline with the new chapter map, a scope and summary for the merged chapter and the new chapter, and a note on the new total length and schedule effect. Add any new style-sheet items, such as pricing terminology.

4. **Author sign-off (me → author):** Send the revised outline and style sheet for approval. This is a hard gate. No drafting on the merged chapter, the new chapter, or the renumbering starts until the author signs again. Work on chapters unaffected by the change may continue.

5. **Rework drafted material (chapter writers, after sign-off):**
   - One writer merges the existing chapters 6 and 7 into a single chapter, cutting duplication.
   - One writer drafts the new pricing chapter.
   - Chapters 11 and 12 writers (in progress) realign to the approved outline.
   - Keep to a maximum of 4 sessions at once, and queue the rest.
   - Update cross-references and chapter numbering throughout.

6. **Consistency pass (me):** Check that all drafted chapters match the signed outline, the numbering, and the style sheet. Confirm that chapter 13 and later chapters (those after the new chapter) still read correctly after the change.

7. **Downstream stages on the full manuscript:** Run these in order once all chapters are drafted:
   - The dev editor writes one editorial letter on the whole manuscript, including the merged and new chapters.
   - Line edit.
   - Copy edit against the Vale rules.
   - Fact-check, with extra attention to the pricing claims and figures.
   - Alt text for the final set of figures, since the merge may remove or change some.

8. **Layout and upload:** Layout builds the book with the final chapter order and TOC. I do a final check, get the author's approval of the proofs, and then upload to KDP.

**Before drafting resumes on the affected chapters:** the revised outline and style sheet must have the author's signature.
````

## B020 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Pause new drafting for the affected work only.** Chapters 10-12 are in progress under the 4-session cap; let any session already running finish its current chapter, but do not start a new chapter session that depends on the outline until step 3 is complete. Chapters 1-5, 8, and 9 are not affected by the merge and can stay in their current stage.

2. **Outliner revises the chapter plan (no drafting yet).** The outliner produces a revised outline with: chapters 6 and 7 merged into one chapter (with a merged summary, word-count target, and section map showing which material from each original chapter is kept, cut, or moved); a new "Pricing Your First Course" chapter inserted after chapter 11, with a stated purpose, scope, and dependencies; and renumbering of all later chapters, plus a list of every cross-reference that changes. Flag any content in chapters 1-9 that the merge or new chapter contradicts or duplicates.

3. **Author sign-off on the revised outline and style sheet.** Send the revised outline to the author. Nothing downstream proceeds until the author signs it again, because any change to the chapter plan requires new sign-off. Ask the author to confirm the merged chapter's scope and where pricing material should sit, since the new chapter's placement affects chapter 12.

4. **Reconcile in-flight work once sign-off arrives.** Chapters 10-11 may reference the old numbering or old chapter 6/7 content. Assign the chapter writer to update only the cross-references and renumbering in those drafts (no rewriting of substance). If chapter 12's drafting has not started, hold it until the new placement is confirmed. Any draft already done for the old chapter 6 or 7 is moved into the merged chapter's source material, not discarded.

5. **Chapter writers draft the merged chapter and the pricing chapter.** Use the existing 4-session cap. Draft the merged chapter from the revised section map, and draft the pricing chapter from its new brief. Both drafts go through the normal flow.

6. **Dev editor reviews the whole manuscript once.** Because the developmental edit is a single letter on the full manuscript, hold it until all 14 chapters (with the merge and the new chapter) are drafted. Ask the dev editor to check the merged chapter's flow and the pricing chapter's fit within the book's arc.

7. **Downstream stages run in order.** Line edit, then copy edit against Vale style rules, then fact-check (the pricing chapter needs fact-checking of any figures, platform fees, or KDP terms). Alt-text writer covers any new figures from the merged or pricing chapters. Layout follows, then KDP upload.

8. **Record the change.** Log the outline revision, the author's dated sign-off, and the renumbering map in the project file so the final manuscript and any later edits trace back to an approved plan.
````

## B021 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Pause new drafting for the affected chapters.** Chapters 10-12 are in progress under the current outline, so the chapter writer sessions for them stop until the plan is re-signed. Chapters 1-5, 8, 9 and the other unaffected drafts are not touched.

2. **Outliner revises the outline.** The outliner produces a revised outline that (a) merges chapters 6 and 7 into one chapter, keeping the material of both and noting which sections come from where, and (b) inserts a new "Pricing Your First Course" chapter after current chapter 11, with its scope, word target and the dependencies it has on earlier chapters. The chapter numbers are renumbered throughout, and the revised outline records the mapping from old to new numbers. The style sheet is checked for anything the new chapter needs (terms, price-format conventions).

3. **Author signs off on the revised outline and style sheet.** Nothing else proceeds until the author signs. The sign-off covers the merged chapter's structure, the new chapter's brief, and the renumbering. If the author changes the scope again, return to step 2.

4. **Map existing drafts to the new structure.** Before any drafting resumes, the outliner and a chapter writer (not the dev editor) identify what in drafted chapters 6 and 7 can be reused in the merged chapter, and whether chapters 10-11 (drafted under old numbering) reference the old 6/7 split or the old chapter numbers. Cross-references are flagged for fixing later, not silently edited.

5. **Resume drafting under the new plan.** The writer sessions resume for the merged chapter, the pricing chapter, and the in-progress chapters 10-12 (now renumbered as needed), respecting the limit of four concurrent chapter sessions. Drafts already written for the merged chapter are revised rather than discarded.

6. **Stage the full manuscript through the pipeline in order.** Once all 13 chapters (14 minus the merge) are drafted, the dev editor writes one editorial letter on the whole manuscript, which is the first point where the structural change is assessed for flow. Then the line editor, then the copy editor applying Vale rules, then the fact-checker. Pricing content gets the fact-checker's attention for current platform fee and pricing figures.

7. **Alt-text and layout.** The alt-text writer covers figures in the new and merged chapters, using the renumbered figure IDs. Layout then builds the ebook, and checks the table of contents and cross-references against the final numbering.

8. **KDP upload and author confirmation.** Before upload, the author gets a final proof and confirms the chapter list matches the signed outline. Only then is the book uploaded to KDP.
````

## B022 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze drafting now.** Pause the chapter writer sessions for 10-12 (these are in progress and may be affected by the restructure). No new chapter sessions start until step 4 clears. Chapters 1-9 stay as drafted, but are not treated as final.

2. **Outliner revises the plan (no drafting).** Outliner produces a revised outline showing: chapters 6 and 7 merged into one chapter, with the merged scope, word budget, and any content cut or moved; a new "Pricing your first course" chapter placed after the (renumbered) chapter 11; and the knock-on renumbering of all later chapters, cross-references, and the dependency notes for 10-12. Outliner also flags which already-drafted chapters (6, 7, and possibly 8-9 if they reference them) need revision.

3. **Author signs off on the revised outline and style sheet.** Both the outline change and any style-sheet impact (e.g., new chapter's voice or terminology) need the author's signature again. Nothing downstream proceeds without this. Ask the author to confirm the exact merged-chapter scope and the pricing chapter's brief, since these are the points most likely to be contested.

4. **Resolve in-progress drafts for 10-12.** Once the signed outline exists, the chapter writer and outliner check whether chapters 10-12 still fit. Anything that moved or renumbered gets re-briefed; anything unaffected resumes. Only then restart sessions, respecting the four-concurrent-session cap (merged chapter and new chapter count against the same cap).

5. **Draft the merged chapter and the new pricing chapter.** Chapter writer drafts the merged 6+7 chapter by reworking the existing drafts of 6 and 7 against the new brief, and drafts the pricing chapter from scratch. Stay within four concurrent sessions.

6. **Downstream impact check on drafted chapters.** Outliner or dev editor confirms that chapters 1-9 and 10-12 have no broken cross-references, duplicated content, or continuity errors from the merge. Any needed fixes to drafted chapters go back through the chapter writer, not ad hoc edits.

7. **Run the normal pipeline on the full manuscript.** Once all 14 (now 15) chapters are drafted: dev editor writes one editorial letter on the whole manuscript → line edit → copy edit against Vale rules → fact-check (pricing chapter gets extra attention for figures and claims) → alt-text for figures → layout.

8. **Publish gate.** Layout proof is checked against the signed outline (chapter count, titles, order). Only then KDP upload. Note the change in the production log so the author's sign-off record matches the delivered book.
````

## B023 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze affected work (me).** Pause new drafting sessions for chapters 6, 7, 11 and 12, and for anything after them that depends on the plan. Chapters 10-12 are in progress, so let 10 finish. Chapters 1-5, 8 and 9 are unaffected, but flag them for a continuity check later. Don't start chapter 13 or 14. Because only 4 sessions can run at a time, the freed slots stay unused until step 4.

2. **Impact assessment (outliner).** Draft a revised outline covering:
   - The merged 6+7 chapter: what content is kept or cut, and the new chapter title.
   - The new "pricing your first course" chapter after 11: scope, and how it relates to the existing chapters.
   - Renumbering: the total goes from 14 to 14 (−1 +1), and the chapters after the merge point shift.
   - Cross-references, figures and the table of contents that need updating.
   - Whether the style sheet needs changes, such as terminology for pricing.
   - Consequences for the drafted text, including what in chapters 6 and 7 can be reused and what in 11 and 12 must change.

3. **Author sign-off (me, with the author).** Send the revised outline and the impact summary to the author for explicit approval. This is required, because any change to the chapter plan needs new sign-off. If the author changes anything, loop back to the outliner. Nothing is drafted on the new plan until sign-off is received.

4. **Resume drafting (me, then chapter writers).** Once the signed outline is in hand, restart drafting in this order:
   - Chapter writer merges 6 and 7 into the new chapter.
   - Chapter writer continues 11 and 12 under the new numbering.
   - Chapter writer drafts the pricing chapter, starting after the 11 content is stable.
   - Chapters 13 and 14 are renumbered and proceed normally.
   - I keep to at most 4 concurrent sessions.

5. **Consistency pass (chapter writer, with the outliner).** Update cross-references and chapter numbers in chapters 1-5, 8 and 9. Check that the merged chapter and the pricing chapter match the style sheet.

6. **Developmental edit (dev editor).** Begin only when all chapters are drafted. The dev editor writes one editorial letter on the whole manuscript. This covers the merge and the new chapter, so the letter isn't done piecemeal.

7. **Downstream stages (line editor, copy editor, fact-checker, alt-text writer).** Run them in order on the full manuscript. The copy editor applies the Vale rules. The fact-checker pays particular attention to pricing claims in the new chapter. The alt-text writer covers the figures, including any new or renumbered ones.

8. **Layout and KDP upload (layout, then me).** Layout builds the final TOC and numbering. I do a final check that the structure matches the signed outline, then upload to KDP.
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

## B025 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
1. **Root cause:** The Pause/Resume button calls `callAdmin('POST', …)` with no body, so `hubAdminApi.ts` sends no `Content-Type` header, and the server's `isJson` check in `senderAction` rejects the request with 415. The CLI works because it doesn't go through this browser path.

2. **Fix the client, `src/app/hud/hubAdminApi.ts`:** In `callAdmin`, when `method` is `POST` or `PUT` and `body` is `undefined`, default the body to `{}`. This makes every state-changing admin call send `Content-Type: application/json` with a valid JSON body, which matches the server contract. Keep the existing behavior for `GET` and `DELETE` unchanged.

3. **Optional, `src/app/hud/HubAdmin.tsx`:** Do not change the button's path or method. If you prefer an explicit fix over the default in step 2, pass `{}` as the third argument to `change('POST', …)` for Pause and Resume. Choose one approach, not both.

4. **Must NOT change: `src/server/guard.ts` / `isJson`.** The JSON requirement is the CSRF defense: a cross-site HTML form cannot send `application/json` without a CORS preflight, so loosening `isJson` or accepting form bodies would reopen the admin-action attack. The fix belongs on the client, not the guard.

5. **Must NOT change: `senderAction` status codes or the `guard(req, res, 'POST')` method check.** The 415 is correct for non-JSON requests. Leave the handler logic for pause, resume, and revoke as is, and confirm the JSON body parser accepts `{}`.

6. **Must NOT change: the CLI (`flow-tower token pause`).** It already works and is out of scope. Confirm it still passes after the change.

7. **Test, server (`hub-admin` tests):** `POST /senders/:id/pause` with `Content-Type: application/json` and body `{}` returns 200 and pauses the sender. Do the same for `resume`. Add a regression test that a `POST` with `Content-Type: application/x-www-form-urlencoded` (or no content type) still returns 415, so the CSRF guard stays proven.

8. **Test, client (`hubAdminApi` tests), the test that proves the fix:** Mock `fetch` and call `callAdmin('POST', '/senders/bob-laptop/pause')` with no body. Assert the request has `Content-Type: application/json` and body `"{}"`. Add a UI test that clicking Pause in `HubAdmin` issues that request and that Resume does the same when the sender is paused. Run the full suite.
````

## B026 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B027 · planner/web-change-request: Plan a late scope change

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
Here is the step-by-step plan:

1. **Studio Lead: Change Request (CR) Scoping & Commercial Approval**
   * *Prerequisites:* Client request received.
   * *Action:* Log the CR in Linear; pause delivery of this out-of-scope feature until scope, timeline, and cost estimates are approved and signed off by the client.

2. **IA-Architect: Content Model & Sitemap Update**
   * *Prerequisites:* Approved CR sign-off.
   * *Action:* Update sitemap and content model for the donation page across the 3 locales (including payment statuses/receipts); create tracking Linear issues for templates, components, and endpoints.

3. **Designer & Copywriter: Wireframes, Visual Design & Trilingual Copy**
   * *Prerequisites:* Step 2 completed.
   * *Action:* Produce donation page wireframes, final UI design, and localized copy in all 3 locales (donation form, payment states, confirmation/receipt).

4. **QA-Auditor & Studio Lead: Design Gate & Client Sign-Off**
   * *Prerequisites:* Step 3 completed.
   * *Action:* QA checks designs against accessibility/contract requirements (QA gate green); Studio Lead secures client visual/copy sign-off.

5. **Backend-Lead: API Contract & Payload Collections**
   * *Prerequisites:* Step 4 completed (client sign-off).
   * *Action:* Define donation endpoints and schemas in `api/openapi.yaml`, configure Payload collections for donation data/locales, and integrate the card payment provider gateway.

6. **Frontend-Lead: Donation UI & Payment Integration**
   * *Prerequisites:* Step 5 completed (`api/openapi.yaml` updated).
   * *Action:* Build donation templates and components across the 3 locales strictly conforming to `api/openapi.yaml` and client-side payment SDK requirements.

7. **Backend-Lead & Frontend-Lead: Integration & Preview Deployment**
   * *Prerequisites:* Step 6 completed.
   * *Action:* Connect frontend and backend lanes in the preview environment; verify end-to-end webhook/payment processing and locale switching.

8. **QA-Auditor: QA Gate Audit**
   * *Prerequisites:* Step 7 completed (preview deployment ready).
   * *Action:* Execute payment security, localized content, and functional tests on the preview deployment until the QA gate is green.

9. **Studio Lead & Client: Preview Review & Sign-Off**
   * *Prerequisites:* Step 8 completed (green QA gate).
   * *Action:* Present preview URL to client for formal acceptance review (max 3 rounds) and capture final sign-off.

10. **Studio Lead, Backend-Lead & Frontend-Lead: Rolling Release & Monitoring**
    * *Prerequisites:* Step 9 completed.
    * *Action:* Execute rolling release deployment to production; monitor transaction logs, error rates, and payment webhooks.
````

## B028 · planner/web-change-request: Plan a late scope change

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
1. **Studio lead: classify and log the request.** A donation page with card payments is not in the signed sitemap or scope, so it is a change request. Write a one-page brief covering the page, card payments, and the three existing locales. *Needs:* the signed sitemap, the scope document, and the current build status.

2. **ia-architect: impact assessment.** Define where the page sits in the sitemap and navigation, and any content-model additions (donation tiers, thank-you and failure states, legal and privacy text, receipts). *Needs:* the brief from step 1.

3. **Backend-lead and frontend-lead: estimates.** Backend covers payment provider choice (e.g. Stripe), payment-intent and webhook endpoints, Payload collections for donations, and PCI-scope minimization via hosted fields or Checkout. Frontend covers the page template, form components, and states. Designer and copywriter estimate the design and copy for 3 locales. *Needs:* the step 2 impact assessment.

4. **Studio lead: change request to the client.** Send the combined estimate (cost, timeline, impact on launch date) and the assumptions: provider account, legal and tax receipt requirements, and the currencies offered. **Hard stop: no work starts until the client approves in writing.** *Needs:* the estimates from step 3.

5. **Studio lead: update Linear.** Once approved, create one issue per page template, component, and endpoint (donation page, form component, create-intent endpoint, webhook endpoint, and so on), all labeled as a change request. *Needs:* client approval and the step 2 structure.

6. **Designer and copywriter: design and copy for the new page.** Cover all states (default, processing, success, error) in 3 locales. Get the client's sign-off on this addition, as an addendum to sign-off 3 and within its round limits. *Needs:* approval, the signed visual system, and the sitemap addendum.

7. **Backend-lead: contract first.** Add the donation endpoints to `api/openapi.yaml` and the Payload collections, then publish them to the frontend. *Needs:* approval and the step 2 content model. This can run in parallel with step 6.

8. **Frontend-lead: build the page.** Build only against endpoints that exist in the contract, and raise any gap with the backend-lead instead of inventing an endpoint. *Needs:* the approved design and copy (step 6) and the published contract (step 7).

9. **Qa-auditor: QA gate on the preview deployment.** Test the payment flow in provider test mode, plus all 3 locales, accessibility, performance, the webhook and failure paths, and regression on existing pages. The gate must be green before the client sees it. *Needs:* the integrated build on preview.

10. **Studio lead: client review and launch.** Run client review on the same preview URL (max 3 rounds), then get sign-off. Launch with the rolling release, switch the payment provider to live keys, run a real low-value test transaction, and start monitoring (payment errors, webhooks). *Needs:* a green QA gate, and the live provider account and keys.
````

## B029 · planner/web-change-request: Plan a late scope change

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

## B030 · planner/web-change-request: Plan a late scope change

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

## B031 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Publishing Lead**: Pause drafting on active sessions (chapters 10–12) and freeze downstream pipeline work.
2. **Outliner**: Revise the outline to merge chapters 6 and 7 into a single chapter, insert the new chapter on "pricing your first course" after chapter 11, and renumber subsequent chapters.
3. **Author**: Review and sign off on the revised outline (mandatory before any drafting resumes).
4. **Chapter Writer**: Consolidate and rewrite the merged chapters 6 and 7 according to the approved outline.
5. **Chapter Writer**: Resume and complete drafting for the remaining chapter batch (up to 4 chapters at a time), including the newly inserted chapter on pricing and the final chapters.
6. **Dev Editor**: Conduct the developmental edit across the entire completed manuscript and deliver a single editorial letter.
7. **Line Editor, Copy Editor (Vale rules), and Fact-Checker**: Perform line editing, copy editing against Vale style rules, and fact-checking sequentially on the revised manuscript.
8. **Alt-Text Writer, Layout Specialist, and Publishing Lead**: Generate alt text for figures, format layout, and complete the final KDP upload.
````

## B032 · planner/web-change-request: Plan a late scope change

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
**Plan: donation page change request (build lanes keep running on signed scope)**

1. **Studio lead: log the change request.** The donation page is outside the signed sitemap, so nobody starts work on it yet. I open a CR in Linear and tell the client that the signed timeline is unchanged and the page will follow as an addition.
   - *Needs:* the client's request in writing.

2. **Studio lead + backend lead: settle the payment questions.** Before anyone estimates, the client must answer:
   - Which payment provider (for example Stripe), and whose account?
   - One-off gifts, recurring gifts, or both?
   - Which currencies for each locale?
   - Do they need receipts or tax certificates?
   - Who owns refunds?

   We commit to hosted or tokenized card fields so card data never touches our servers. This keeps PCI scope at SAQ-A.
   - *Needs:* step 1.

3. **IA architect: propose the sitemap and content-model changes.** This covers where the page sits in the sitemap and navigation, plus the content model in all three locales: a donation page template, amount presets, and thank-you and failure states.
   - *Needs:* step 2 answers.

4. **Designer, copywriter, frontend lead, backend lead, QA auditor: estimate.** Each gives an estimate for their part. I combine them into a single CR estimate with its impact on the schedule. The client approves the CR in writing, with a mini sign-off on the sitemap and content addendum.
   - *Needs:* step 3.

5. **Designer + copywriter: wireframe, design and copy.**
   - The designer produces a wireframe, then the visual design, reusing existing components wherever possible.
   - The copywriter writes the copy in all three locales, including legal and consent text and payment error messages.
   - Before the client sees it, the QA auditor checks accessibility and that all locales are complete.
   - The client gives sign-off on the design and copy, with the same round limits as before (2 for the wireframe, 3 for design and copy).
   - *Needs:* step 4 approval.

6. **Backend lead: build the payment backend, contract first.** In this order:
   1. Add the endpoints to `api/openapi.yaml` and merge them: create payment intent or checkout session, and the payment-provider webhook.
   2. Add a Donations collection in Payload, plus localized page fields.
   3. Store keys as secrets per environment, with the payment provider in test mode on preview.
   4. Make the webhook idempotent and verify its signatures.
   - *Needs:* step 4 approval. This can run in parallel with step 5.

7. **Frontend lead: build the page.** Build it only against the merged contract, never against invented endpoints. That includes the payment form or redirect, the success, failure and cancel states, and all three locales.
   - *Needs:* the step 5 sign-off and the merged step 6 contract.

8. **Studio lead: keep Linear current.** Create one issue each for:
   - the donation page template
   - each new component (amount selector, payment form, result states)
   - each endpoint (payment intent, webhook)

   Link all of them to the CR, and update their status as each step progresses.
   - *Needs:* step 4. Continues ongoing throughout.

9. **QA auditor: run the QA gate on the preview deployment.** Tests use test cards and cover:
   - successful payments, declined cards and 3-D Secure checks
   - webhook retries
   - every locale and currency
   - accessibility, performance, security headers, and that no card data is logged

   The gate must be green. Only then does the client review the page on the same preview URL, with a maximum of 3 rounds.
   - *Needs:* step 7 done.

10. **Backend lead + frontend lead + studio lead: launch.**
    1. Switch the payment provider to live keys and run one real low-value transaction, then refund it.
    2. Launch with a rolling release.
    3. Monitor payment errors, webhook failures and conversion.
    4. Agree on-call ownership for payment incidents.
    - *Needs:* client sign-off from step 9.
````

## B033 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze the plan (me).** Accept no chapter changes outside the outline. Pause the chapter 10–12 sessions at a clean checkpoint and save their drafts. Start no new chapter sessions. Chapters 1–9 stay as drafted for now. Why pause 11 and 12: the new chapter goes right after 11, so 11's ending and 12's opening and back-references will change.

2. **Revise the outline and style sheet (outliner).**
   - Merge chapters 6 and 7 into one chapter plan, listing what gets cut, kept or moved.
   - Add "Pricing your first course" after current chapter 11, with its scope, key points, any figures, and how it hands off to the chapter after it.
   - Renumber everything. The total stays at 14, since one chapter is lost and one gained.
   - Map old numbers to new ones and flag every cross-reference affected.
   - Update the style sheet for any new terms, such as pricing vocabulary.

3. **Get the author's sign-off (author, routed by me).** The author signs the revised outline and style sheet. **Drafting does not resume until this signature exists.** If the author asks for changes, it goes back to step 2.

4. **Write a change brief per chapter (outliner and me).** Each affected chapter gets a short brief built from the signed outline:
   - the merged chapter 6/7;
   - the new chapter;
   - adjustments to chapters 10–12 (new numbering, the 11→new chapter transition, 12's opening);
   - cross-reference fixes in chapters 1–9.

5. **Resume drafting (chapter writers).** Run at most 4 sessions at a time:
   - **Wave 1:** resume 10, 11 and 12 under their briefs, plus the 6+7 merge.
   - **Wave 2:** the new pricing chapter, which starts once 11 is final so it continues from it.
   - **Wave 3:** the remaining chapters (13 and 14 in the new numbering), up to 4 at a time.
   - Then a cross-reference fix pass on chapters 1–9.

6. **Developmental edit (dev editor).** This starts only when all 14 chapters are drafted. The dev editor writes one editorial letter on the whole manuscript, checking that the merged chapter and the new chapter fit the book's arc. Any structural change it asks for goes back through steps 2–3.

7. **Line edit, then copy edit (line editor, copy editor).** The line editor works through the revised manuscript. The copy editor then applies the Vale style rules and the updated style sheet.

8. **Fact-check, alt text, layout, upload (fact-checker, alt-text writer, layout).**
   - The fact-checker checks the pricing claims and the merged material.
   - The alt-text writer covers all figures, including new ones and any renumbered ones.
   - Layout builds the book, regenerating the table of contents and internal links.
   - Then the KDP upload.
````

## B034 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Publishing Lead**: Pause drafting on active chapters (10–12) and hold any new writing sessions.
2. **Outliner**: Revise the outline to merge chapters 6 and 7 into a single chapter and insert the new "Pricing Your First Course" chapter after chapter 11 (adjusting total chapter numbering to 14).
3. **Author**: Review and sign off on the revised outline and updated style sheet (*drafting cannot resume until this sign-off is secured*).
4. **Chapter Writer**: Consolidate and rewrite the merged chapter 6/7 draft, complete drafting chapters 10–11, write the new post-chapter 11 pricing chapter, and finish remaining chapters through 14 (adhering to the limit of at most 4 chapter sessions concurrently).
5. **Dev Editor**: Conduct the developmental edit across the complete manuscript and deliver one consolidated editorial letter to the author and writer.
6. **Line Editor & Copy Editor**: Perform line editing, followed by copy editing using Vale style rules once dev revisions are complete.
7. **Fact-Checker & Alt-Text Writer**: Fact-check the edited manuscript and generate alt text for all figures.
8. **Layout Specialist & Publishing Lead**: Complete interior layout, then perform final review and execute the KDP upload.
````

## B035 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Pause and protect (publishing lead, now).** Let the sessions on chapters 10 and 11 finish their current pass, then hold them. Pause chapter 12, because the new chapter will come right before it and its opening and transitions may change. Do not start any new drafting session. Snapshot drafted chapters 1–12 as the baseline.

2. **Revise the outline (outliner).** Update the chapter plan with two changes:
   - A merged chapter 6/7, with its scope, the sections that stay, the sections that are cut, and the transitions in and out.
   - A new chapter, "Pricing your first course," placed after chapter 11, with its goals, key points, and the figures it needs.

   Renumber the book (14 chapters → 14 total: 13 after the merge, plus 1 new). Flag knock-on effects on chapters 8–12, such as cross-references, "as we saw in chapter 7" lines, and anything 12 now has to set up or assume. Update the style sheet if new terms appear, for example pricing vocabulary and currency format.

3. **Get the author's sign-off (publishing lead → author).** Send the revised outline, the new numbering, and the impact list. **Drafting does not resume until the author signs.** If they ask for changes, the outliner revises and the author signs again.

4. **Resume drafting under the signed outline (chapter writers, at most 4 sessions at a time).** Run these sessions:
   - (a) Merge chapters 6 and 7 into one chapter.
   - (b) Finish chapter 11, adjusted to lead into the new chapter.
   - (c) Draft the new pricing chapter.
   - (d) Finish chapter 10.

   That is four sessions. Chapter 12 waits until a slot frees, then it is adapted to follow the pricing chapter. After that, draft the remaining chapters in order.

5. **Clean up references (chapter writer, in one of the four slots).** Fix cross-references and numbering across chapters 8–12 to match the new outline. Do not change content outside what the outline allows.

6. **Developmental edit (dev editor).** Once the full manuscript is drafted, write one editorial letter covering the whole book, with particular attention to the merge seam and how the pricing chapter fits. Any fix that changes the chapter plan goes back through steps 2–3.

7. **Line edit and copy edit (line editor, then copy editor).** The line editor goes first. The copy editor then applies the Vale style rules and the updated style sheet.

8. **Fact-check, alt text, layout and upload (fact-checker → alt-text writer → layout → publishing lead).**
   - The fact-checker gives the pricing chapter priority, checking numbers, platform fees and claims.
   - The alt-text writer covers all figures, including the new ones.
   - Layout builds the book with the new numbering and table of contents.
   - The publishing lead does the KDP upload.
````

## B036 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Publishing lead: freeze new drafting now.** Start no new chapter sessions. Tell the writers on chapters 10–12 to keep drafting but to avoid hard-coded chapter numbers and cross-references, because the numbering is about to change. If the new pricing chapter would overlap chapter 12's content, pause chapter 12.

2. **Outliner: revise the outline.**
   - Merge chapters 6 and 7 into one chapter plan, saying which parts of the existing drafts are kept, cut or rewritten.
   - Add the new "Pricing your first course" chapter after chapter 11.
   - Renumber the book. It stays at 14 chapters: the merge removes one and the new chapter adds one, so old chapters 8–14 shift.
   - Update the style sheet for any new terms, such as pricing vocabulary.
   - Record what changes for chapters 10–12 and for later chapters, such as foreshadowing and references to "chapter 7."

3. **Author: sign off on the revised outline and style sheet.** This gate is required. No new drafting resumes until the author signs. If the author asks for changes, go back to step 2.

4. **Publishing lead: brief the chapter writers on the signed outline.** Running sessions on 10–12 get any adjustments, such as a new handoff into the pricing chapter and new chapter numbers.

5. **Chapter writers: resume drafting under the 4-session cap.**
   - The 10–12 sessions already use 3 slots.
   - Add 1 session: the merged 6/7 chapter, written from the two existing drafts.
   - As slots free up, run the new pricing chapter and the remaining later chapters, at most 4 at a time.

6. **Chapter writers: finish the whole manuscript.** Then do a consistency pass on cross-references and numbering.

7. **Dev editor: write one editorial letter on the complete manuscript.** Do not edit chapter by chapter. Any change the letter proposes to the chapter plan goes back through the outliner and needs author sign-off again.

8. **Specialists: run the rest of the pipeline in order.**
   1. Line editor
   2. Copy editor, using the Vale rules and the updated style sheet
   3. Fact-checker, with extra care on pricing claims and figures
   4. Alt-text writer, covering figures from the merged and new chapters
   5. Layout, including the renumbered table of contents
   6. KDP upload

**Before drafting resumes:** the outline and style sheet must be revised and signed by the author again, and the writers must be briefed. Until then, only the in-flight 10–12 sessions continue, with chapter numbering kept flexible.
````

## B037 · planner/web-change-request: Plan a late scope change

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

## B038 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze (me, now):** Pause the start of any new drafting sessions, including chapters 13-14. Let the 3 in-flight sessions (10-12) finish their current drafts, but mark them provisional. Chapters 10-12 are being written against the old numbering and cross-references, so they will need a renumber pass later. Nothing goes to dev edit yet.

2. **Impact check (outliner):** Draft a revised outline with these changes:
   - Merge 6+7 into one chapter. Define what is cut, what is kept, and the new length.
   - Insert the pricing chapter after 11. Define its scope, its place in the arc, and its dependencies.
   - Renumber everything after the merge, so the book goes from 14 to 14 chapters (−1 +1).
   - List knock-on effects: cross-references, the style sheet, the promise in the intro, and the part structure.

3. **Author sign-off (me → author):** Send the revised outline and style sheet changes to the author for written approval. A change to the chapter plan requires this. Drafting does not resume without it. If the author rejects or amends the plan, the outliner revises and it goes back for sign-off.

4. **Merge 6+7 (chapter writer):** After sign-off, one writer merges the already-drafted chapters 6 and 7 into a single chapter. This is a rewrite of existing text, not a fresh draft. It counts as one session.

5. **Reconcile 10-12 (chapter writers):** Check the in-flight drafts against the approved outline. Fix numbering, cross-references, and any overlap with the pricing chapter, and only then accept them. The 4-session cap applies at every point: the merge (1) plus 10-12 (3) makes 4. The pricing chapter, and then 13-14, wait for a free slot.

6. **Draft the new chapter (chapter writer):** Start the pricing chapter when a session frees up. Then draft 13-14 as slots open, never exceeding 4 concurrent sessions.

7. **Gate before the dev edit (me):** Confirm that all 14 chapters match the signed outline and that numbering and cross-references are consistent. The dev editor then writes one editorial letter on the whole manuscript, so the full manuscript must exist first. Any later structural change sends us back to step 3.

8. **Downstream, in order:** Line edit → copy edit (Vale) → fact-check (the pricing chapter needs particular scrutiny for figures and claims) → alt text (including any figures in the merged and new chapters) → layout → KDP upload.
````

## B039 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B040 · planner/web-change-request: Plan a late scope change

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
1. **Freeze and log the request (studio lead).** Do not start any work. Record the client's donation-page ask in Linear as a change request, not as build work. Scope: a new page template, card payment integration, and three-locale content. Needs: the client's written request. No specialist is dispatched yet.

2. **Estimate the change request (studio lead with ia-architect and backend-lead).** ia-architect sizes the sitemap and content-model delta (new page template, donation content types, locale variants). backend-lead sizes the payment integration, the webhook and receipt flows, and the new endpoints. Output: a priced estimate covering design, copy, translation, frontend, backend, QA, and the 3-locale multiplier. Needs: step 1 logged.

3. **Client approves the change request (studio lead, client).** Nothing proceeds without a signed estimate and an approved change to the sitemap and scope. Needs: step 2 estimate delivered and accepted in writing. Until then, the current build lanes keep working only on signed scope.

4. **Amend the sitemap and content model (ia-architect).** Add the donation page and its content types to the signed sitemap, with the three locales mapped. Needs: step 3 approval. This is the new sign-off gate for the change, and the client signs off the amended sitemap.

5. **Wireframe, design, and copy the donation page (designer, copywriter).** Designer produces wireframes, then visual design. Copywriter drafts copy in all three locales. Respect the existing sign-off-2 and sign-off-3 rounds limits for the new page, with the client signing off the wireframes and visuals before build. Needs: step 4 signed.

6. **Update the API contract first (backend-lead).** Add donation endpoints (create payment intent, confirm, receipt lookup, and so on) to `api/openapi.yaml`, plus the Payload collections for donations. Frontend does not start on any endpoint until it is in the contract. Needs: step 5 designs approved, so the fields are known.

7. **Build in parallel (frontend-lead, backend-lead).** Frontend builds the donation template and components, consuming only contract endpoints. Backend implements the payment flow, the webhooks, and the Payload collections. Linear gets one issue per page template, component, and endpoint. Needs: step 6 contract merged. Frontend requests any missing endpoint from backend, never invents one.

8. **QA gate on the preview deployment (qa-auditor).** Run the full QA across all three locales, including payment sandbox tests, accessibility, and the existing pages' regressions. The gate must be green before client review. Needs: step 7 built and deployed to preview.

9. **Client review on the same preview URL (studio lead, client).** Client reviews the donation page with max 3 rounds. Fixes go through the studio, and any new ask beyond the approved scope becomes a new change request. Needs: step 8 green.

10. **Launch and monitor (studio lead, frontend-lead, backend-lead).** Roll out the donation page via the rolling release, watch payment success rates and errors, and close the Linear issues. Needs: step 9 client sign-off and a release checklist that includes live payment keys and a rollback plan.
````

## B041 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B042 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze affected work (me).** Pause new drafting on chapters 6, 7, 11 and any chapter that depends on them. Chapters 10 and 12 are being drafted now (3 sessions open). They can finish if they don't depend on 6/7 or on the new chapter. Chapters 13 and 14 stay unstarted. Do not start the new chapter until the outline is signed.

2. **Impact check (outliner).** Compare the current outline against both requests. List which chapters change: the 6+7 merge (what content is cut, what is kept, the new word count) and the new pricing chapter after 11 (scope, position, and its effect on the flow into 12). Also renumber: the book goes from 14 to 14 chapters (14 − 1 + 1), and chapters 8 onward shift. Flag cross-references, figures, and style-sheet terms that are affected.

3. **Revised outline and style sheet (outliner).** Produce a revised outline with the new chapter numbering, a one-paragraph brief for the merged chapter and for the pricing chapter, and any style-sheet additions, such as pricing terminology and currency conventions.

4. **Author sign-off (me → author).** Send the revised outline for explicit approval. Nothing that changes the chapter plan proceeds without it. If the author asks for revisions, loop back to step 3.

5. **Resume drafting after sign-off (chapter writer).** Within the limit of 4 concurrent sessions, do these in priority order:
   - Finish 10 and 12 (under their new numbers), reconciling them with the revised outline.
   - Merge 6 and 7 into one chapter, reusing existing drafts.
   - Draft the new pricing chapter.
   
   Start the merge and the new chapter only as slots free up, so the total never exceeds 4.

6. **Draft-complete gate (me).** Confirm that all chapters match the signed outline, are renumbered, and have working cross-references. Then confirm 13 and 14 are drafted, again within the limit of 4 sessions.

7. **Editorial pipeline (specialists, in order).** The dev editor writes one editorial letter on the whole manuscript, which is only possible once every chapter is drafted. Then the line editor, the copy editor (Vale rules), and the fact-checker (the pricing claims need special care) each work in turn. Then the alt-text writer handles figures, including any that were renumbered or merged.

8. **Layout and upload.** Layout builds the book, and I review the proof. Then I upload to KDP.
````

## B043 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B044 · planner/web-change-request: Plan a late scope change

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
# Plan: donation page (change request)

The donation page is outside the signed sitemap, so it runs as a change request. The build lanes keep working on the signed scope throughout. Nothing for this page is built until the client approves the estimate.

1. **Studio lead: log the change request and pause work on it.**
   - Needs: the client's request in writing.
   - Open a change-request issue in Linear with the stated need: card donations in all three locales.
   - Ask the client to confirm:
     - one-off or recurring donations
     - currencies and preset amounts
     - payment provider and merchant account owner
     - tax receipts and legal/privacy text
     - the go-live date
   - Tell the frontend and backend leads that no donation work starts until approval.

2. **ia-architect, with backend-lead: scope the change.**
   - Needs: the client's answers from step 1.
   - ia-architect proposes the sitemap addition: the donation page, plus a success/thank-you page and a failure state, in each locale.
   - ia-architect also proposes the content-model changes, such as donation copy fields and amount presets in Payload.
   - backend-lead outlines the payment approach:
     - a hosted or embedded provider checkout, so card data never touches our servers (keeps PCI scope small)
     - a webhook for payment confirmation
     - a Payload collection for donation records

3. **Studio lead: send the estimate and get approval.**
   - Needs: the scope from step 2, plus effort input from the designer, copywriter and both leads.
   - Send the client an estimate covering cost, timeline impact on launch, and any extra review rounds.
   - Gate: written approval of the estimate and a signed addendum to the sitemap.
   - Nothing below starts without this.

4. **Studio lead: update Linear.**
   - Needs: the approval from step 3.
   - Create one issue each for:
     - the donation page template and the thank-you template
     - new components (amount selector, payment form/embed, status messages)
     - each new endpoint (for example, create-payment-session and the provider webhook)
     - the new Payload collection
   - Link all of them to the change request.

5. **designer and copywriter: produce the page.**
   - Needs: step 4, and the existing signed design system and copy.
   - Run a wireframe round and a visual round for the new templates, reusing signed components where possible.
   - Copy covers all three locales, including error, decline and receipt messages, with legal text reviewed by the client.
   - Client sign-off on this mini design + copy package, within the round limits.

6. **backend-lead: contract first.**
   - Needs: the approved scope from step 3. It can run in parallel with step 5.
   - Add the endpoints to `api/openapi.yaml` and add the Payload collection.
   - Then implement provider integration, webhook signature verification, idempotency, and test-mode keys on preview.
   - Publish the contract change to the frontend lead.

7. **frontend-lead: build the UI.**
   - Needs: the signed design and copy from step 5 and the merged contract from step 6.
   - Build the templates and components against the contract only.
   - Handle locale routing, currency and number formatting, and accessibility of the payment form.
   - If anything is missing from the contract, request it from backend-lead and do not invent it.

8. **qa-auditor: run the QA gate on the preview deployment.**
   - Needs: steps 6 and 7 deployed to preview with test keys.
   - Test across all three locales:
     - successful, declined and 3-D Secure payments
     - webhook retries and duplicates
     - accessibility, performance and security checks
   - The gate must be green before the client sees it.

9. **Studio lead: client review.**
   - Needs: the green QA gate from step 8.
   - The client reviews on the same preview URL, up to 3 rounds; any fixes are re-checked by QA.
   - Get client sign-off on the donation page.

10. **backend-lead and frontend-lead: launch, then monitor.**
    - Needs: the sign-off from step 9 and live provider keys from the client's merchant account.
    - Switch to live keys and ship in the rolling release.
    - Make a small real-card test donation, then monitor payment errors, webhook failures and conversion.
    - Close the Linear issues.
````

## B045 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B046 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
1. **Root cause:** `pause`/`resume` are bodiless POSTs, so `callAdmin` sends no `Content-Type` header, and the server's `isJson` CSRF guard in `senderAction` correctly rejects the request with 415. The CLI works because it doesn't go through this browser header path.

2. **Change `src/app/hud/hubAdminApi.ts` (the fix point):** In `callAdmin`, for every non-GET method, default `body` to `{}` when it is `undefined`, so the request always sends `Content-Type: application/json` and a valid JSON body (`"{}"`). Keep the GET path unchanged, sending no body and no header. Do not add a per-button workaround in `HubAdmin.tsx`; the button code can stay as it is. This also covers any other bodiless admin POST (e.g. revoke) with the same bug.

3. **Do not change `src/server/guard.ts` or `senderAction` in `src/server/hub-admin.ts`:** The `isJson` requirement is the CSRF defense. A cross-site HTML form can only send form or text bodies, so relaxing the check to accept them would let any web page pause or revoke senders. The server is behaving as designed; the client is the one that is wrong.

4. **Do not change the CLI path (`flow-tower token pause`):** It already works and is not affected by the browser header logic.

5. **Test (client unit):** In the `hubAdminApi` test suite, mock `fetch` and assert that `callAdmin('POST', '/senders/x/pause')` (no body) sends `Content-Type: application/json` and body `"{}"`. Also assert that a GET sends neither header nor body.

6. **Test (server integration, the proof):** Using the real `guard` and `senderAction` routes, assert that `POST /api/hub/admin/senders/bob-laptop/pause` with `Content-Type: application/json` and body `{}` returns 200 and flips the sender to paused. Do the same for `resume`.

7. **Regression guard test:** Assert that a `POST` to the same route with `Content-Type: application/x-www-form-urlencoded` (no JSON) still returns 415 with `{"error":"body must be application/json"}`. This pins the CSRF protection so it cannot be silently removed to "fix" the bug.

8. **Done criteria:** Both tests pass, the existing admin test suite is green, and manually clicking Pause/Resume in the HUD shows the state toggling with no 415 in the console.
````

## B047 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze the chapter plan (me, now).** No new drafting sessions start. Chapters 10–12 pause at their current state rather than being finished against an outline that is about to change. Chapter 12 is the most exposed: it moves to position 13, and its material may overlap with the new pricing chapter. Nobody edits chapters 6 or 7 directly.

2. **Revise the outline (outliner).**
   - Merge 6 and 7 into one new chapter 6, with a section plan showing what is kept, cut and bridged.
   - Add the new chapter "Pricing your first course" after old chapter 11.
   - Renumber the plan. It stays at 14 chapters: old 8–11 become 7–10, the new chapter is 11, and old 12–14 become 12–14.
   - Flag overlaps and cross-references in drafted chapters 1–9 and in-progress 10–12, especially any pricing content already in 11 or 12.
   - Update the style sheet if new terms are needed, such as pricing vocabulary.

3. **Get the author's sign-off (me → author).** I send the revised outline, the impact list and any style-sheet changes. Nothing changes in any chapter until the author has signed.

4. **Resume drafting, which is allowed only after step 3.** I allocate sessions to chapter writers, never more than 4 at once:
   - (a) the paused old 10–12 resume against the new outline, with any adjustments the outliner flagged;
   - (b) one session merges old 6 and 7 into new chapter 6, following the signed section plan.

5. **Draft the remaining chapters (chapter writers).** As sessions free up, writers draft the new chapter 11 and then old 13–14. They also fix the cross-references and renumbering the outliner listed.

6. **Developmental edit (dev editor).** This starts only when all 14 chapters are drafted. The dev editor writes one editorial letter on the whole manuscript, checking the merged chapter and the new chapter for flow, duplication and fit. Any change to the chapter plan from that letter goes back through the outliner and the author's sign-off.

7. **Downstream stages, in order.** The line editor works first, then the copy editor applying the Vale style rules with the updated style sheet. Next the fact-checker checks the pricing claims and the merged material. Then the alt-text writer covers all figures, including figures from old 6 and 7 that are renumbered or merged.

8. **Layout and upload.** Layout rebuilds the table of contents, numbering and internal links, and I give a final check before the KDP upload.
````

## B048 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B049 · planner/web-change-request: Plan a late scope change

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
1. **Freeze and log the request (studio lead).** Do not start any work yet. Record the client's donation-page ask as a change request in Linear. It is outside the signed sitemap and scope, so it needs an estimate. Needs: the client's written request, including the three locales and the card-payment requirement.

2. **Scope and estimate (ia-architect, with backend-lead for payments).** Assess the new page's place in the sitemap, the content model changes, and the payment integration. Produce a change-request estimate covering design, copy, build, QA, and any payment compliance work across the three locales. Needs: step 1 complete. Output: estimate and proposed sitemap delta.

3. **Client approval of the change request (studio lead).** Send the estimate and the sitemap delta. Work on the donation page does not start until the client signs the change request. Needs: step 2 output. Nothing in steps 4 onward begins before this.

4. **Protect the running build (studio lead, frontend-lead, backend-lead).** Confirm the current frontend and backend lanes continue on the signed scope only. Keep the lanes separate from the donation work. Needs: step 3 approved, or an explicit decision to keep the donation work out of the current sprint.

5. **Update the sitemap and content model (ia-architect).** Add the donation page and any new Payload collections (for example donation campaigns or amounts) as a signed change, with a sign-off from the client. Needs: step 3 approved.

6. **Copy and visual design for the new page, in all three locales (copywriter, designer).** Run the new page through the same wireframe-to-design flow, with sign-off rounds tracked under the change request. Needs: step 5 sign-off. Create one Linear issue per page template and component.

7. **Extend the API contract first (backend-lead).** Add the donation endpoints (for example create payment intent, get campaign) to `api/openapi.yaml` and the Payload collections before any frontend work touches them. Needs: step 5 approved, and the payment provider chosen. Frontend never invents an endpoint.

8. **Build the donation page (frontend-lead, backend-lead).** Frontend builds against the updated contract; backend implements the endpoints and payment integration. Needs: step 6 designs and copy approved, and step 7 contract merged. Create one Linear issue per endpoint and component.

9. **QA gate on the preview deployment (qa-auditor).** Run the full QA audit on the donation page across all three locales, including payment flows in test mode. The gate must be green before any client review. Needs: step 8 complete on preview.

10. **Client review and launch (studio lead).** Client reviews on the same preview URL (within the 3-round limit for this change request), then the page joins the rolling release with monitoring for payment errors. Needs: step 9 green and client sign-off on the change request scope.
````

## B050 · planner/web-change-request: Plan a late scope change

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

## B051 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B052 · planner/web-change-request: Plan a late scope change

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
Here is the plan for adding the donation page:

1.  **Change Request & Initial Scoping:**
    *   **Who:** Studio Lead (coordinates), ia-architect, designer, copywriter, frontend-lead, backend-lead, qa-auditor.
    *   **Order:** Studio Lead initiates. Specialists provide estimates.
    *   **Needs:** Understanding of the client's requirements for the donation page (e.g., specific payment gateway, form fields, success/failure flows).
    *   **Result:** A documented change request with estimated effort and cost, presented to the client for approval.

2.  **Sitemap & Content Model Definition:**
    *   **Who:** ia-architect.
    *   **Order:** After client approval of the change request.
    *   **Needs:** Approved change request. Collaboration with the Studio Lead for any sitemap impact.
    *   **Result:** Updated sitemap entry for the donation page across three locales, and new/updated Payload collections/fields for donation data and content. Create Linear issues for these. This constitutes a mini "Sign-off 1" for this specific feature.

3.  **Wireframes for Donation Page:**
    *   **Who:** designer.
    *   **Order:** After ia-architect completes step 2.
    *   **Needs:** Approved sitemap and content model.
    *   **Result:** Wireframes for the donation page (including form, payment flow, success/failure states) in three locales. Present to client for review and approval (mini "Sign-off 2", max 2 rounds for this feature). Create Linear issues for page template and components.

4.  **Visual Design & Copy for Donation Page:**
    *   **Who:** designer (visuals), copywriter (copy).
    *   **Order:** After client approval of wireframes.
    *   **Needs:** Approved wireframes.
    *   **Result:** Final visual design and copy for the donation page across three locales. Present to client for review and approval (mini "Sign-off 3", max 3 rounds for this feature).

5.  **Backend API Design & Implementation:**
    *   **Who:** backend-lead.
    *   **Order:** After client approval of visual design and copy (step 4).
    *   **Needs:** Approved visual design/copy, content model from step 2, and details of the chosen payment gateway.
    *   **Result:** Updated `api/openapi.yaml` with endpoints for donation processing and any related data. Initial backend implementation for payment integration, data storage, and locale support. Create Linear issues for new endpoints and backend services.

6.  **Payload Integration for Donation Content:**
    *   **Who:** backend-lead.
    *   **Order:** In parallel with step 5, or immediately after API design is stable.
    *   **Needs:** Approved content model from step 2.
    *   **Result:** Payload collections configured for managing donation-related content (e.g., page text, confirmation messages) across three locales, and any donation records.

7.  **Frontend Implementation:**
    *   **Who:** frontend-lead.
    *   **Order:** After backend-lead provides the `api/openapi.yaml` (step 5) and Payload is ready for content (step 6).
    *   **Needs:** Approved visual design and copy (step 4), `api/openapi.yaml` with new donation endpoints, access to Payload for content.
    *   **Result:** Frontend implementation of the donation page, forms, payment interaction, and locale switching. Create Linear issues for new frontend components.

8.  **QA of Donation Feature:**
    *   **Who:** qa-auditor.
    *   **Order:** After frontend and backend implementation are feature-complete on a preview deployment.
    *   **Needs:** Completed frontend and backend work, access to the preview deployment.
    *   **Result:** All QA checks passed for the donation page, including functionality, responsiveness, security (payment integration), and locale support. Ensure the QA gate is green.

9.  **Client Review & Approval:**
    *   **Who:** Studio Lead (coordinates), client.
    *   **Order:** After QA gate is green (step 8).
    *   **Needs:** Green QA gate, access to the preview URL.
    *   **Result:** Client review of the integrated donation page on the preview environment. Max 3 rounds for this specific feature. Client provides final approval.

10. **Deployment & Monitoring:**
    *   **Who:** Studio Lead (coordinates), frontend-lead, backend-lead.
    *   **Order:** After client approval (step 9).
    *   **Needs:** Client sign-off on the donation page feature.
    *   **Result:** Rolling release of the updated website including the new donation page. Ongoing monitoring of the donation page's performance and payment gateway integration.
````

## B053 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
1. **Root cause:** `callAdmin` omits both the body and the `Content-Type` header when `body` is undefined. The Pause/Resume button passes no body, so the request reaches `senderAction`, fails `isJson`, and gets a 415. The CLI works because it sends JSON.

2. **Change `src/app/hud/hubAdminApi.ts`:** for every state-changing method (`POST`, `PUT`, `DELETE`), always send `Content-Type: application/json`. Send `JSON.stringify(body ?? {})` as the body.
   - For `GET`, keep sending no body and no `Content-Type`. Browsers reject a GET with a body.
   - This fixes Pause, Resume and Revoke, and any other body-less admin action, in one place. Patching only the button would leave the same bug elsewhere.

3. **Leave `HubAdmin.tsx` alone.** The button call is correct once `callAdmin` is fixed. Do not add `{}` at individual call sites.

4. **Do NOT change `src/server/guard.ts` or the `isJson` check in `src/server/hub-admin.ts`.** The JSON requirement is a deliberate CSRF defence: a cross-site HTML form can only send form or text bodies, so it cannot trigger an admin action. Do not loosen it in any way, including:
   - accepting an empty body,
   - accepting a missing `Content-Type`,
   - accepting `text/plain`,
   - exempting pause, resume or revoke.

5. **Check the server handlers accept `{}`.** `senderAction` and the other POST, PUT and DELETE admin routes must tolerate an empty JSON object body. If any handler parses the body and rejects `{}`, make it treat `{}` as "no parameters". Do not touch the content-type check while doing this.

6. **Client unit test (`hubAdminApi`, mock `fetch`):**
   - `callAdmin('POST', '/senders/bob-laptop/pause')` calls fetch with `method: 'POST'`, header `Content-Type: application/json` and body `'{}'`.
   - A call that passes an explicit body still sends that body.
   - `callAdmin('GET', …)` sends no body and no `Content-Type`.

7. **Server regression tests (`hub-admin`), keeping the CSRF guard locked in:**
   - `POST /api/hub/admin/senders/bob-laptop/pause` with `Content-Type: application/json` and body `{}` returns success, and the sender is now paused.
   - The same for `resume`: the sender is unpaused.
   - The same request with no `Content-Type` returns 415.
   - The same request with `application/x-www-form-urlencoded` returns 415.
   - The same request with `text/plain` returns 415.

8. **Manual check:** in the hub UI, click Pause and then Resume on `bob-laptop`. There should be no 415 in the console, the paused state should toggle, and it should match what `flow-tower token` reports.
````

## B054 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
Here is the plan to address the author's requests:

1.  **Outliner:** Revise the outline for chapters 6 and 7 to reflect their merger, and create a new outline for the "pricing your first course" chapter.
2.  **Author:** Review and sign off on the revised outline for the merged chapters (now one chapter) and the new chapter outline.
3.  **Outliner:** Update the comprehensive book outline to incorporate the merged chapter and the new chapter, adjusting all subsequent chapter numbering.
4.  **Chapter Writer:** Revise the drafted chapters 6 and 7 into a single, merged chapter based on the new signed-off outline.
5.  **Chapter Writer:** Draft the new "pricing your first course" chapter based on its signed-off outline.
6.  **Publishing Lead:** Confirm the author's sign-off on the revised outlines.
7.  **Publishing Lead:** Ensure all relevant parties (dev editor, line editor, etc.) are informed of the revised chapter numbering and content changes.

Drafting of *any* new content (the merged 6/7, and the new chapter after 11) cannot resume until the corresponding outlines are signed off by the author.
````

## B055 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
1. **Root cause:** `callAdmin` omits both the body and the `Content-Type` header when `body` is `undefined`. The Pause/Resume button passes no body, so the request reaches `senderAction` without `application/json`, and the CSRF guard rejects it with 415.

2. **Change `src/app/hud/hubAdminApi.ts`.** For every non-GET method (`POST`, `PUT`, `DELETE`), always send `Content-Type: application/json` and a JSON body, defaulting to `{}`:
   - `const payload = method === 'GET' ? undefined : JSON.stringify(body ?? {});`
   - Set `headers` to `{ 'Content-Type': 'application/json' }` whenever `payload !== undefined`.
   - GET stays as it is: no body, no content type.

3. **Leave `src/app/hud/HubAdmin.tsx` unchanged.** The fix belongs in the shared client, so every caller that omits a body is fixed, including Revoke and any future action. Optionally, grep for other `callAdmin`/`change` calls with no body and confirm they are covered.

4. **Must NOT change: `src/server/guard.ts` (`isJson`) and the 415 check in `src/server/hub-admin.ts`.** Do not loosen, bypass or special-case them for bodiless POSTs. Requiring `application/json` is deliberate CSRF protection: a cross-site HTML form cannot send that content type without a CORS preflight. Relaxing it would reopen cross-site pause/resume/revoke.

5. **Must NOT change: the CLI and its server path.** `flow-tower token pause` already sends a compliant request.

6. **Unit test for `hubAdminApi`** (mock `fetch`):
   - `callAdmin('POST', '/senders/bob-laptop/pause')` is called with `method: 'POST'`, `headers['Content-Type'] === 'application/json'` and `body === '{}'`.
   - A call with an explicit body still serializes that body.
   - `callAdmin('GET', ...)` sends no body and no content-type header.

7. **Server regression test for `hub-admin`:**
   - POST `/senders/bob-laptop/pause` with `Content-Type: application/json` and body `{}` returns success and the sender becomes paused; the same holds for resume.
   - The same POST with no content type, or with `text/plain` / `application/x-www-form-urlencoded`, still returns 415. This proves the CSRF guard is intact.

8. **Manual check:** in the hub UI, Admin › Senders › Pause, then Resume, on `bob-laptop`. The network tab should show 2xx responses, and the paused state should flip in the list.
````

## B056 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
Here is the plan:

1.  **Outliner:** Revise the master outline to reflect the merger of chapters 6 and 7 and the addition of a new chapter on "pricing your first course" after chapter 11. Adjust chapter numbering accordingly.
2.  **Author:** Review and sign off on the revised outline.
3.  **Chapter Writer:**
    *   Merge and revise the drafted content for the new combined chapter (formerly 6 and 7).
    *   Draft the new chapter on "pricing your first course."
4.  **Dev Editor:** Assess the impact of the changes on the overall manuscript flow and content, especially for chapters 1-9, and prepare for a comprehensive developmental edit once all chapters are drafted.
5.  **Project Lead:** Coordinate with the Chapter Writer to ensure drafting of the new chapter and revision of the merged chapter happens in line with the "at most 4 chapter sessions at a time" rule.
6.  **Before Drafting Resumes:** The author must sign off on the revised outline. This is the prerequisite for the Chapter Writer to begin work on the merged chapter content and the new chapter.
````

## B057 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B058 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Freeze drafting (me, now).** Pause the chapter-writer sessions on 10–12 at a clean save point and start no new sessions. The new chapter after 11 changes what 12 leads into, and the 6+7 merge renumbers everything after it, so no chapter text changes until the revised outline is signed. Drafts 1–9 and the partial 10–12 stay as they are.

2. **Outliner revises the outline and style sheet.**
   - Merge the 6 and 7 entries into one chapter, with its scope, key points and any cut material.
   - Add the "Pricing your first course" entry after current 11, with its scope and the facts or figures it needs.
   - Update the transitions in 11 and 12, the cross-references and the renumbering. The book stays at 14 chapters: one is lost in the merge and one is added.
   - Update style-sheet terms such as pricing vocabulary.
   - Produce a short change log showing which drafted chapters this touches.

3. **Author reviews and signs off on the revised outline and style sheet.** This is the gate. Drafting does not resume, and no merge rewrite starts, until the signature is in. If the author asks for changes, they go back to step 2.

4. **Resume drafting after sign-off, with no more than 4 sessions at once.**
   - Session 1: the chapter writer rewrites the merged 6+7 from the signed outline, using the existing drafts as source.
   - Sessions 2–3: the chapter writers finish 10 and 11, adjusting 11's ending to the new transition.
   - Session 4: the new pricing chapter.
   - The rest of 12 waits for a free slot.

5. **Draft the remaining chapters in order, no more than 4 at a time.** That is the rest of 12, then the remaining chapters through 14. Each writer quickly checks cross-references against the renumbered outline.

6. **Dev editor writes one editorial letter on the whole manuscript, only after all 14 chapters are drafted.** Any structural change the letter recommends goes back through the outliner and needs the author's sign-off again.

7. **Line editor, then copy editor, then fact-checker, in that order.**
   - The copy editor applies the Vale rules from the updated style sheet.
   - The fact-checker gives priority to the new pricing chapter: figures, platform fees and any claims about money or the law.

8. **Alt-text writer, then layout, then KDP upload.**
   - The alt-text writer covers figures from the merged and new chapters.
   - Layout checks the table of contents, renumbering and cross-references before I approve the KDP upload.
````

## B059 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B060 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
Here's the plan to address the author's requests:

1.  **Immediately halt drafting** on chapters 10-12.
2.  **Outliner revises the outline** to merge chapters 6 and 7, and to add the new chapter "pricing your first course" after the original chapter 11 (adjusting subsequent chapter numbers as needed).
3.  **Author reviews and signs off** on the revised outline.
4.  **Chapter Writer revises the drafted content** of former chapters 6 and 7 to reflect their new merged structure.
5.  **Chapter Writer drafts** the new chapter "pricing your first course."
6.  **Chapter Writer resumes drafting** chapters 10-12 (and any subsequent chapters) based on the approved, revised outline.
7.  **Outliner updates the style sheet** if the new content introduces significant new terms, concepts, or formatting requirements.
8.  **Before further developmental editing begins**, all 15 chapters (including the newly merged and added ones) must be drafted and approved against the final outline.
````

## B061 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B062 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
Here is the plan to handle the requested changes:

1. **Publishing Lead:** Pause drafting on chapters 10–12 immediately so writers do not draft against an outdated chapter plan.
2. **Outliner:** Update the outline and style sheet to reflect the merge of chapters 6 & 7 and the insertion of the new "pricing your first course" chapter (adjusting subsequent chapter numbers/scope accordingly).
3. **Author:** Review and formally sign off on the revised outline and chapter plan (*must happen before drafting resumes*).
4. **Chapter Writer:** Resume drafting by merging/revising drafted chapters 6 & 7 into a single chapter, completing in-progress chapters, drafting the new pricing chapter, and finishing the remaining chapters (keeping to at most 4 chapters at a time).
5. **Dev Editor:** Review the completed full manuscript and produce a single editorial letter across all chapters.
6. **Line Editor & Copy Editor:** Perform line editing followed by copy editing using Vale style rules.
7. **Fact-Checker & Alt-Text Writer:** Complete fact-checking on the text and write alt text for all figures.
8. **Layout Specialist & Publishing Lead:** Layout specialist formats the ebook; publishing lead reviews final files and performs KDP upload.
````

## B063 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
1. **Root Cause**: `callAdmin` only sends the `Content-Type: application/json` header when `body !== undefined`, but `change` in `HubAdmin.tsx` invokes `POST` without a body, failing `isJson(req)` in the server's CSRF guard.
2. **File to Change**: `src/app/hud/HubAdmin.tsx` (or alternatively `src/app/hud/hubAdminApi.ts`). Change the caller in `HubAdmin.tsx` to pass an empty object body (e.g. `{}`) in `change('POST', ..., {})` (or update `callAdmin` to always set `'Content-Type': 'application/json'` and `body: JSON.stringify(body ?? {})` for mutating methods like `POST`/`PUT`).
3. **What Must NOT Change**: Do not modify `src/server/guard.ts` or `src/server/hub-admin.ts` to make `isJson` optional for `POST` requests, as requiring `application/json` on state-changing admin routes is a critical CSRF defense against cross-site HTML form submissions.
4. **Test**: In the UI, navigate to Admin › Senders, click "Pause" and "Resume" on a sender, and verify in DevTools Network tab that the requests return HTTP 200 with the sender status updating without 415 errors; optionally add an integration/unit test asserting `POST /api/hub/admin/senders/:id/pause` succeeds with a JSON content-type and empty JSON payload.
````

## B064 · planner/web-change-request: Plan a late scope change

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
1. **Studio Lead — Change Request & Scope Baseline**
   * *Prerequisites:* Client request received.
   * *Action:* Log the donation page and card payment integration as a formal Change Request (CR) with scope, budget, and timeline estimates; create tracking issues in Linear for templates, components, and endpoints; issue CR to client for written sign-off before starting work.

2. **IA-Architect — Content Model & Sitemap Update**
   * *Prerequisites:* Signed Change Request.
   * *Action:* Update the sitemap and define the donation content model (including localized fields across all three locales) for sign-off 1 update.

3. **Designer & Copywriter — Wireframes, Visuals & Multi-locale Copy**
   * *Prerequisites:* Updated sitemap and content model.
   * *Action:* Designer creates wireframes and final UI components for donation flows (form, payment state feedback) across breakpoints; Copywriter delivers copy localized in all three locales (sign-off 2 and sign-off 3 closure for this CR).

4. **Backend-Lead — API Contract Update (`api/openapi.yaml`)**
   * *Prerequisites:* Visual designs and copy approved.
   * *Action:* Define endpoints for donation submission, payment gateway intent/processing, and receipt generation in `api/openapi.yaml` to maintain the API contract.

5. **Backend-Lead — Payload Collections & Payment Integration**
   * *Prerequisites:* Updated `api/openapi.yaml`.
   * *Action:* Configure Payload collections for donation records with tri-locale support and implement secure card payment processing/webhooks matching the contract.

6. **Frontend-Lead — UI Components & API Integration**
   * *Prerequisites:* Updated `api/openapi.yaml` published and Payload collections available.
   * *Action:* Build the donation page template and localized payment form components, integrating strictly against the backend endpoints.

7. **Studio Lead — Preview Deployment**
   * *Prerequisites:* Frontend and backend donation feature branches merged to the preview environment.
   * *Action:* Trigger and verify the preview deployment containing the localized donation flow and payment gateway test mode.

8. **QA-Auditor — QA Verification Gate**
   * *Prerequisites:* Preview deployment live.
   * *Action:* Run full functional, payment processing, cross-browser, and multi-locale verification; must achieve a green QA gate before client handoff.

9. **Studio Lead & Client — Client Review & Sign-off**
   * *Prerequisites:* Green QA gate on preview URL.
   * *Action:* Present the preview URL to the client for validation of the donation flow across all three locales and secure sign-off (max 3 rounds).

10. **Studio Lead, Frontend-Lead & Backend-Lead — Launch Integration**
    * *Prerequisites:* Client sign-off and green QA.
    * *Action:* Merge CR into main release line for inclusion in the planned rolling launch and post-launch monitoring.
````

## B065 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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

## B066 · planner/web-change-request: Plan a late scope change

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

## B067 · planner/ebook-outline-change-v2: Plan a mid-book change (v2)

### Task rubric

```regex
outline
sign[- ]?off|signs off|approv
(pause|hold|stop|freeze|halt|suspend)[\s\S]{0,120}(draft|chapter|session)|(draft|chapter|session)[\s\S]{0,120}(pause|hold|stop|freeze|halt|suspend|resum|until)
```

```must-not
(skip|without) (the )?(author'?s? )?sign[- ]?off
```

Rubric (blind scorer, 0-10):
- 3 points: the change goes through the outline: the outliner updates the chapter plan and style sheet, and the author signs it off before more drafting.
- 3 points: handles work in flight: pauses or holds the chapters affected (10-12 may renumber; 6-7 need a merge pass), keeps the 4-session cap when drafting resumes.
- 2 points: the merged chapter and the new chapter are drafted, then the whole manuscript goes through the dev edit and the later stages in order.
- 2 points: names the right specialists; no invented phases; at most 8 steps.

### Answer

````text
1. **Publishing Lead**: Pause drafting on active sessions (chapters 10–12) to prevent rework and keep the active session limit aligned with the new structure.
2. **Outliner**: Revise the master outline and style sheet to reflect the merge of chapters 6 and 7 into a single chapter and the addition of the new "pricing your first course" chapter after chapter 11 (updating the total chapter count and numbering).
3. **Author**: Review and sign off on the revised outline and chapter plan. *(Drafting cannot resume until this sign-off is completed).*
4. **Chapter Writer**: Consolidate and rewrite drafted chapters 6 and 7 into the single merged chapter according to the approved outline.
5. **Chapter Writer**: Resume drafting under the revised chapter plan, completing chapters 10–12 and the new pricing chapter (respecting the limit of at most 4 active drafting sessions at a time).
6. **Chapter Writer**: Draft the remaining final chapters until the full manuscript is complete.
7. **Dev Editor**: Conduct the developmental edit across the entire completed manuscript and deliver a single comprehensive editorial letter.
8. **Downstream Specialists (Line Editor → Copy Editor → Fact-checker → Alt-text Writer → Layout → Publishing Lead)**: Sequentially complete line editing, Vale copy editing, fact-checking, figure alt-text generation, interior layout, and final KDP upload.
````

## B068 · planner/web-change-request: Plan a late scope change

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
1. **Studio lead: classify the request as a change request.** A donation page with card payments is not in the signed sitemap or scope. Pause any work on it. Needs: the signed sitemap and scope. Build lanes continue on the signed scope.

2. **ia-architect: assess the sitemap impact.** Define where the page sits in the sitemap and navigation, the content model additions (donation tiers, copy blocks, thank-you and failure states), and the three-locale routing. Needs: step 1.

3. **backend-lead: technical and compliance assessment.** Choose the payment provider and integration approach, with hosted checkout or elements to keep us out of PCI scope. Define the endpoints (create payment intent, webhook, confirmation), the Payload collections (donations, if records are stored), and the GDPR and receipt implications. Needs: step 2.

4. **Studio lead: write the estimate and send the change request to the client.** Cover design, copy and translation for three locales, frontend, backend, QA, and the impact on timeline and on the QA and client review rounds. Also list the client's responsibilities: payment provider account, legal text, and the tax receipt policy. Needs: steps 2 and 3. **No work starts until the client approves in writing.**

5. **Studio lead: update Linear after approval.** Create one issue per new item: the donation page template, each new component (amount selector, payment form, thank-you state), and each endpoint. Tag them all as the change request. Needs: step 4 approval.

6. **designer and copywriter, in parallel: design and copy the new page.** The designer produces the page, with its states and error handling, in the approved visual system. The copywriter writes the copy and the three-locale versions. Needs: step 5. Send the additions to the client for sign-off as an addendum to sign-off 3, after a green QA gate on the design.

7. **backend-lead: add the endpoints to `api/openapi.yaml` and build the Payload collections and payment logic.** Do this before the frontend consumes anything. Needs: steps 5 and 3. The contract must be merged first.

8. **frontend-lead: build the donation page.** Use only endpoints present in the contract, with the approved design and copy, in all three locales. Needs: the contract from step 7 and the approved design and copy from step 6.

9. **qa-auditor: run the QA gate on the preview deployment.** Cover test-mode payments, failure and cancel paths, webhook handling, the three locales, accessibility, performance, and a regression pass on existing pages. Needs: steps 7 and 8. The gate must be green before the client sees anything.

10. **Studio lead: run client review of the page on the same preview URL, within the 3-round limit.** Then launch via the rolling release, with live-payment smoke testing and monitoring of payment errors and webhooks. Needs: a green QA gate from step 9 and the client's review approval.
````

## B069 · planner/hub-pause-415-v2: Plan the fix for a real bug (v2)

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
**Root cause:** The Pause/Resume button calls `callAdmin('POST', path)` with no body, so `callAdmin` omits the `Content-Type` header. The server's `isJson` CSRF guard in `senderAction` then rejects the request with 415. The CLI works because it sends JSON.

**Plan**

1. **Fix the client in `src/app/hud/HubAdmin.tsx` (or `hubAdminApi.ts`).** The smallest fix is to make the button send an empty JSON object: `change('POST', path, {})`. That requires `change` to accept and forward a body argument to `callAdmin`. Check how `change` is defined and pass `{}` through.

2. **Alternative in `hubAdminApi.ts`.** For `POST`, `PUT` and `DELETE`, always send `Content-Type: application/json` and a body of `JSON.stringify(body ?? {})`. This fixes every body-less state-changing call at once, including revoke, which has the same bug. I recommend this option because it removes the whole class of bug. Keep `GET` without a header or body.

3. **Audit other callers.** Grep for every `callAdmin('POST'|'PUT'|'DELETE'` call and for `change(` call sites without a body. Confirm that revoke and any other action routes are covered by the step 2 fix.

4. **Do NOT change `guard.ts`, `isJson`, or the 415 check in `hub-admin.ts`.** The `application/json` requirement is a deliberate CSRF defense. A cross-site HTML form cannot send that content type without a CORS preflight. Relaxing it to accept a missing content type would let a form post pause or revoke senders. The server is behaving correctly and the client is at fault.

5. **Do NOT work around it by sending `text/plain` or form-encoded bodies.** Those are exactly the content types the guard exists to block.

6. **Test the client.** Unit test `callAdmin` with a mocked `fetch`:
   - `POST` with no body sends the header `Content-Type: application/json` and body `{}`.
   - `GET` sends no content-type header and no body.

7. **Test the server (regression guard).** Keep or add tests that `POST /senders/:id/pause` returns 415 with no content type or with `text/plain` or `application/x-www-form-urlencoded`. Also test that it returns 200 with `application/json` and body `{}`, including a `application/json; charset=utf-8` variant, and that the sender's paused state changes.

8. **Verify manually.** In the hub UI, click Pause, then Resume, then Revoke. Each should return 2xx with no console errors, and the sender list should update.
````

## B070 · planner/web-change-request: Plan a late scope change

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
