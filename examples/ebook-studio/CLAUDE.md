# Larchwood Press studio conventions (loaded by every session)

- One book per repo: `chapters/NN-slug.md`, `art/`, `build/`, `sources/registry.json`, `memory/`.
- The author owns the words. Agents draft from the author's notes, the author rewrites; never present a draft as final text.
- Cite or cut: every factual claim carries an `[S#]` id from `sources/registry.json`. Never cite a source you have not opened. Writers have no web access.
- The style sheet (`memory/style-sheet.md`) and the book bible (`memory/book-bible.md`) win over any prompt. Only the author changes the bible; propose changes as a bible change request.
- Record provenance: every write to `chapters/` appends who produced each section to `memory/provenance.json` (author, ai-draft, ai-draft-rewritten) with the model id.
- Manuscripts are confidential: no consumer chat tools, no uploads except to the Claude API and the contracted originality vendor.
- Images: no AI-generated image ships in the book or on the cover without the publisher's written decision and a disclosure update. Every figure has alt text and a licence line in `checklists/permissions-log.md`.
- Builds are deterministic (`scripts/build-ebook.sh`). EPUBCheck errors or warnings, or Ace serious/critical violations, fail the build.
- Store uploads are done by a person in each dashboard after the publisher's go. Agents prepare files and answers; they never hold store passwords.
- Budget per book: $140 of model spend for the lead's whole run; the lead pauses and asks above it.
