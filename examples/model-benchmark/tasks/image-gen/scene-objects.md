---
id: scene-objects
category: image-gen
endpoint: images
check: vision-judge
steps: 1
---
# Draw a scene with counted objects and a spatial relation

From real work: the marketing-studio and ebook-studio examples generate illustrations from a brief; the brief's objects, counts and positions are what a reviewer checks first.

## Prompt

A photo-realistic picture of a wooden table seen from the front. On the table, from left to right: three red apples, then one green glass bottle. Behind the table, a plain white wall. No people, no text.

## Expected

The vision judge (another family) answers each question; every answer must match.

```json
[{"q":"Are there exactly three apples?","a":true},{"q":"Are the apples red?","a":true},{"q":"Is there exactly one bottle?","a":true},{"q":"Is the bottle green?","a":true},{"q":"Is the bottle to the right of all the apples?","a":true},{"q":"Is there any person in the image?","a":false},{"q":"Is there any readable text in the image?","a":false}]
```
