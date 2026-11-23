# Landing page (offline)

A single static page that describes Flow Tower. It is a **squad test**: an end-to-end check that the squad can create a small deliverable under `sandbox/landing-page/` from an issue, with no build step.

## Files

- `index.html`: the page. Its content comes from the root [README.md](../../README.md): the one-sentence description, three features, the install and first-run commands, and the repository link.
- `style.css`: the only stylesheet. It is linked locally, with no external fonts or images.

## Running it

Open `index.html` directly in a browser. It needs no build step, no server and no network access while loading.

## Checks the page is meant to meet

- One `h1`, and `header`, `main` and `footer` landmarks.
- Readable layout at 375 px and 1280 px.
- WCAG AA contrast for text and links, and a visible focus ring on links.
- No images, so no alt text is needed.

If the root README changes, update `index.html` by hand to match.
