---
id: poster-text
category: image-gen
endpoint: images
check: vision-judge
steps: 1
---
# Render exact text on a poster

From real work: the social-studio and course-studio examples make covers and posters whose title must read exactly as written.

## Prompt

A minimalist poster: a black background with the words FLOW TOWER in large white capital letters in the centre, and below them, smaller, the words SEVEN LAYERS in orange. Nothing else on the poster.

## Expected

```json
[{"q":"Does the image contain the exact words FLOW TOWER, spelled correctly?","a":true},{"q":"Are the words FLOW TOWER white?","a":true},{"q":"Does the image contain the exact words SEVEN LAYERS, spelled correctly?","a":true},{"q":"Are the words SEVEN LAYERS orange?","a":true},{"q":"Is the background black?","a":true},{"q":"Is there any other text besides FLOW TOWER and SEVEN LAYERS?","a":false}]
```
