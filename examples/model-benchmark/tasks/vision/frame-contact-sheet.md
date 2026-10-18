---
id: frame-contact-sheet
category: vision
check: json
images: fixtures/frame-contact-sheet.png
steps: 1
---
# Frame QA on a contact sheet

From real work: the ai-video-studio example's frame QA agent (`examples/ai-video-studio/prompts/frame-qa.md`: garbled text, black frames, logo outside the safe zone). The contact sheet is a local rendering of three 9:16 frames with planted defects.

## Prompt

You review a contact sheet of three sampled 9:16 frames from a short video, labelled with their timestamps. The dashed rectangle in each frame is the title-safe zone; the logo must sit fully inside it. On-screen captions must be correctly spelled English.

For each frame decide: is it black (no picture)? Is the logo outside (even partly) the safe zone? Is any on-screen text misspelled or garbled? A frame with none of these is clean.

Reply with JSON only: `{"clean": [<timestamps>], "black_frame": [<timestamps>], "logo_outside_safe_zone": [<timestamps>], "garbled_text": [<timestamps>]}`, timestamps written as on the sheet (e.g. "0:02"), each list in time order, empty lists allowed.

## Expected

```json
{"clean":["0:02"],"black_frame":["0:07"],"logo_outside_safe_zone":["0:12"],"garbled_text":["0:12"]}
```
