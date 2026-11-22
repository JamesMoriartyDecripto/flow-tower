# Landing page (squad test)

This folder is a squad end-to-end test, not a product page. It checks that the dev squad can build a small static page from a repository README.

- `index.html` owns the semantic content: one `h1`, header, main and footer landmarks.
- `style.css` owns the presentation: responsive layout at 375 and 1280 pixels, and WCAG AA contrast.
- The text comes only from the root `README.md`: the product sentence, three features, the repository link and the quick-start commands.

The page is plain HTML and CSS. It needs no build, no runtime state and no network requests: open `index.html` directly from the file system. The repository link navigates to GitHub when activated.
