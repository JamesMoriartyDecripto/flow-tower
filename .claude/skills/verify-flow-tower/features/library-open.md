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

## Driving it with verify.mjs

Preconditions:

- `node $V doctor` lists the project you want among its ids.

- **Open a project.** Click its card. Run `node $V open sre-incident --name library-open`. The JSON's first step has `"stack": ["sre-incident/sre-incident.tower.yaml"]`, `"library": false` and `"view": "tower"`.
- **Check the screen.** Open `library-open.png`. The top bar shows `LIBRARY 39` and the tower's name, `SRE Incident Responder`. The left panel lists the layers, and a 3D tower is in the middle.
- **Back to the library.** Press `l`. Run `node $V open sre-incident --keys l --name library-back`. The step after `l` has `"library": true`.

## Gotchas

- An unknown project name makes `open` print `FAIL` with five valid ids. Copy an id from there or from `doctor`.
- The first open of a big tower takes several seconds: the layout runs after the click. The drive waits up to 30 seconds.
- Headless Chrome renders WebGL in software. The picture is correct but slow to appear, and a PNG is about 0.9 MB.
