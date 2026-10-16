---
id: rolling-ball
category: video-gen
endpoint: videos
check: vision-judge
duration: 5
resolution: 480p
steps: 1
---
# Generate a short clip with a clear motion

From real work: the ai-video-studio example turns a shot list into clips; the motion and the objects of each shot are what a reviewer checks.

## Prompt

A static camera shot of a white table. A single red ball rolls from the left edge of the frame to the right edge. Plain grey background, no people, no text.

## Expected

```json
[{"q":"Is there a red ball?","a":true},{"q":"Does the ball move from the left side of the frame to the right side?","a":true},{"q":"Is the ball on a white table?","a":true},{"q":"Does the camera stay still?","a":true},{"q":"Is any person visible?","a":false}]
```
