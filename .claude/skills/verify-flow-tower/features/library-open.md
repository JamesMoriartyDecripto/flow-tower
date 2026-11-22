# Open a tower from the library

The app opens on the library: one card per project found in the served folders. Choosing a card shows that project's tower in 3D, with its layers listed on the left.

## Sub-features

- `library-list` shows one card per project.
- `library-open` opens a project's tower from its card.
- `library-back` returns to the library.

## How to get to it (user POV)

- Open the app's address. The library is the first screen.
- Click a project card.
- Press `l` in a tower to show the library again.

## Driving it with Playwright

Preconditions:

- `doctor --project <project>` reports the project as served.

- **List.** Go to `<url>/?quality=eco` and wait for `window.__flowTower`. The page has one `[data-card]` element per project: 39 with the checkout's examples. The heading reads `39 projects`.
- **Open.** Click `[data-card="<project id>"]`. The store's `stack[0]` becomes the project id, `library` is `false` and `view` is `tower`. The top bar shows the tower's name and a `canvas` fills the middle.
- **Back.** Press `l`. The store's `library` becomes `true` and the cards are on screen again.
- **Proof.** A picture of the library, a picture of the tower, and the store state read after each step.

## Gotchas

- The card you want can be below the fold. Playwright scrolls to it before the click.
- The first open of a big tower takes several seconds: the layout runs after the click.
- A screenshot taken right after the click shows an empty canvas. Wait for the tower to draw.
