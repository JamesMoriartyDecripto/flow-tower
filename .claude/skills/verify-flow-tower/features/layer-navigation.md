# Move through layers and views

In a tower, the user steps from layer to layer with the keyboard and switches between the 3D tower and the map, where every layer lies flat, one under the other.

## Sub-features

- `layer-step` focuses the next or the previous layer.
- `view-map` switches between the tower view and the map view.

## How to get to it (user POV)

- Press `PageDown` or `PageUp` in a tower.
- Click a layer in the `LAYERS` panel on the left.
- Press `m`, or click `MAP` in the bottom bar.

## Driving it with Playwright

Preconditions:

- The project is open: see [library-open](./library-open.md).

- **Step down.** Press `PageDown` twice, reading the store after each key. `focusedLayer` is absent after the open, `0` after the first key and `1` after the second.
- **Map.** Press `m`. `view` becomes `map` and `focusedLayer` is absent again: the map shows every layer. In the bottom bar `MAP` is highlighted and `ORBIT` is greyed out.
- **Proof.** A picture before the first key and one after each step, with the store state next to each.

## Gotchas

- No layer is focused right after a tower opens: `focusedLayer` is missing from the state, not `0`.
- The layout is asynchronous. On a busy machine a key can arrive before the layer exists. Press until the state changes, with a time limit, as `pressUntil` in `e2e/fixtures.ts` does.
- Blur the focused element before sending keys, or a text field takes them.
