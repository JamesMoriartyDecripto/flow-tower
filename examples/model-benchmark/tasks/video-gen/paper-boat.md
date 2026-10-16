---
id: paper-boat
category: video-gen
endpoint: videos
check: vision-judge
duration: 5
resolution: 480p
steps: 1
---
# Generate a calm scene with one object

From real work: the ai-video-studio example's b-roll shots: one subject, a simple setting, no cuts.

## Prompt

A white paper boat floats slowly on calm blue water, seen from slightly above. One continuous shot, no cuts, no people, no text.

## Expected

```json
[{"q":"Is there a paper boat?","a":true},{"q":"Is the boat white?","a":true},{"q":"Is the boat on water?","a":true},{"q":"Is the clip one continuous shot with no cuts?","a":true},{"q":"Is there any readable text?","a":false}]
```
