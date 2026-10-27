# Learned patterns

DO/DON'T rules promoted from repeated review findings. Injected into agents by the
SessionStart hook (filtered by the issue's areas). One rule per line:
`- DO|DONT [areas] rule (#issue)`. `*` means every area.

## Global
- DO [*] Write the failing test first when fixing a bug, then the fix (#212)
- DONT [*] Weaken, skip or delete a test to make the suite green (#198)
- DO [*] Keep each plan step under ~150 changed lines so review stays under 10 minutes (#240)
- DONT [*] Add a dependency for something a node: built-in already does (#251)
- DO [*] Read the pinned version in the lockfile before trusting library docs (#263)
- DONT [*] Let Cognitive Complexity exceed 15 in a single function; split nested logic early (Barón et al. 2020)
- DO [*] Keep functions between ~10 and ~40 LOC. Too short is as risky as too long (Malaiya & Denton 2000)
- DONT [*] Leave duplicate code (>6 similar lines) without a documented reason to keep it (AlOmar 2025)
- DO [*] Write comments that explain WHY, never WHAT; keep them ≤2 lines and always in English (Rani et al. 2023)
- DONT [*] Add abstractions, wrappers or generic helpers without evidence of reuse in the current issue (YAGNI)
- DO [*] Use English only: identifiers, comments, commit messages, docs, error strings
- DONT [*] Mix languages or leave Italian / non-English text in code or comments

## API
- DO [api,auth] Check authorization on every new route, not only authentication (#277)
- DO [api] Validate request bodies with the shared zod schemas in src/schemas (#219)
- DONT [api] Return raw database errors to clients; map them to typed HTTP errors (#230)

## Data
- DO [db,migration] Ship migrations as expand/contract: add column, backfill, then drop (#288)
- DONT [db] Run unbounded queries in request handlers; paginate with a cursor (#256)

## Frontend
- DO [ui] Use role-based Playwright selectors (getByRole) so e2e survives restyles (#301)
- DONT [ui] Store tokens in localStorage; use the httpOnly session cookie (#244)

<!-- squad:append -->
