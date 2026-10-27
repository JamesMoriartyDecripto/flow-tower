# Learned patterns

DO/DON'T rules promoted from repeated review findings, plus a few global rules with
their source. Injected into every role, filtered by the issue's areas: by the
SessionStart hook in Claude sessions, at the end of the system prompt in the
OpenRouter loop. One rule per line: `- DO|DONT [areas] rule (#issue)`. `*` means every area.

## Global
- DO [*] Write the failing test first when fixing a bug, then the fix (#212)
- DONT [*] Weaken, skip or delete a test to make the suite green (#198)
- DO [*] Keep each plan step under ~150 changed lines so review stays under 10 minutes (#240)
- DONT [*] Add a dependency for something a node: built-in already does (#251)
- DO [*] Read the pinned version in the lockfile before trusting library docs (#263)
- DONT [*] Let a function's Cognitive Complexity exceed 15; split nested logic early (metric: Barón et al. 2020; threshold: SonarSource default)
- DO [*] Keep each comment consistent with the code it describes, and say why, not what (Rani et al. 2023)
- DONT [*] Add an abstraction, wrapper or helper that has no caller in this issue (YAGNI)
- DO [*] Use English only: identifiers, comments, commit messages, docs, error strings

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
