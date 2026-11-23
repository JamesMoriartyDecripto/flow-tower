# Greeting page (squad test)

This folder holds a standalone greeting page. It exists as a **squad test**
fixture for the fix-round workflow, not as part of the Flow Tower app.

## What it does

- `index.html` shows a heading. With no name it reads `Hello, stranger!`.
- `greet.js` reads the `name` query parameter and replaces the heading with
  `Hello, <name>!`. The name is set as text, so HTML in it is shown literally.
- `style.css` holds simple local styling.

The page needs no build step and makes no network requests. It works when
opened directly from the file system.

## How to open it

Open `index.html` in a browser, then add a URL-encoded `name` parameter:

- `index.html?name=Ada` shows `Hello, Ada!`
- `index.html` (no parameter) shows `Hello, stranger!`
- `index.html?name=` (empty value) shows `Hello, !`
- `index.html?name=%3Cb%3EAda%3C%2Fb%3E` shows the literal text `Hello, <b>Ada</b>!`
