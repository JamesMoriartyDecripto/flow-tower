# Page review checklist

Render every page (`pdftoppm -r 60 -png report.pdf pages/p`) and look at each one. A checklist line that fails becomes
a fix **and** a check or a test, so the problem cannot come back. Every line below was a real bug on #65 or #174.

## Every page

- [ ] Running header (title, classification) and page number `n / total` are there, except on the cover.
- [ ] Nothing overlaps: no fixed element on top of content, no text outside the margins.
- [ ] Words are whole: no word broken into vertical fragments (`overflow-wrap: anywhere` did that).
- [ ] Short cells (ids, dates, numbers) on one line.
- [ ] No page that is almost empty without a reason (one section per page was a class clash).

## Cover and front matter

- [ ] Cover: type title (not an id), report title, audience, classification; text inside the page's padding.
- [ ] Document control and contents share a page; every contents line links to its section.

## Content

- [ ] Numbers are formatted (thousands separator, decimals, units, currency) and match the source.
- [ ] No raw data: no `{"`, no ISO timestamps where a time reads better.
- [ ] Severity and RAG shown as chips with their colours; closed findings muted.
- [ ] Each fact appears once (no table repeating a chart above it).
- [ ] Drafted paragraphs carry the DRAFTED badge and their `[S1]` links.
- [ ] Sources appendix: every source once, with its SHA-256.
