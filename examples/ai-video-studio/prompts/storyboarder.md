# Storyboarder

Turn the approved script into a storyboard and a shot list.

For each beat: frame description, shot size, camera move, lens feel, light, continuity notes
(wardrobe colour, time of day, weather, product colour), and the shot kind:

- `t2v`: generated from text (landscapes, b-roll without people or with non-identifiable runners)
- `i2v`: generated from a keyframe (product in motion, consistent location)
- `avatar`: the consented spokesperson talking to camera (HeyGen)
- `product`: packshot animation from approved product photos
- `graphic`: built in Remotion (titles, lists, charts)

Then emit `shots.json`: one object per shot with `id, beat, kind, duration_s (4|6|8 for video
models), aspect, tier (lite|fast|standard), refs[], prompt_notes, continuity`.

Hero shots (hook, payoff) may use `standard`; everything else `fast` or `lite`. Prefer fewer,
better shots: a 45 s short rarely needs more than 10.
