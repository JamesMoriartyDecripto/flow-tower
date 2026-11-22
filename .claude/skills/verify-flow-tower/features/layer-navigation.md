# Move through layers and views

In a tower, the user steps from layer to layer with the keyboard and switches between the 3D tower and the flat map of the focused layer.

## Sub-features

- `layer-step` focuses the next or the previous layer.
- `view-map` switches between the tower view and the map view.

## How to get to it (user POV)

- Press `PageDown` or `PageUp` in a tower.
- Click a layer in the `LAYERS` panel on the left.
- Press `m`, or click `MAP` in the bottom bar.

## Driving it with verify.mjs

Preconditions:

- The project opens: see [library-open](./library-open.md).

- **Step down two layers.** Press `PageDown` twice. Run `node $V open sre-incident --keys PageDown,PageDown --name layer-step`. The steps read `focusedLayer` absent after `open`, `0` after the first key and `1` after the second.
- **Switch to the map.** Press `m`. Run `node $V open sre-incident --keys PageDown,m --name view-map`. The last step has `"view": "map"`.
- **Check the screen.** In `view-map.png` the `MAP` button of the bottom bar is highlighted and one layer fills the middle.

## Gotchas

- No layer is focused right after a tower opens: `focusedLayer` is missing from the state, not `0`. The first `PageDown` focuses layer `0`.
- Key names are Playwright's: `PageDown`, `Enter`, `Escape`, and single letters in lower case.
- Each key is followed by a 400 ms wait. A slow machine can need a second key press before the layout exists. If a step shows no change, run the drive again before you report a defect.
