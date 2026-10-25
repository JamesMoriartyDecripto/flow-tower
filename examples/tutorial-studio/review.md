# Review checklist

The reviewer watches the full video once, then goes through the contact sheet (one frame per scene). Each line is
pass or fail; a fail names the scene and goes back to the script (a wrong claim, bad sync) or to the recording (a
frame problem, a flaky render). At most three rounds; then back to the outline ([brief.md](brief.md), sign-offs).

## Accuracy

- [ ] Every command shown exists and prints what the overlay shows (run it on a fresh clone).
- [ ] Every key and button the narration names does what it says.
- [ ] Every claim is in the brief's sources of truth; nothing comes from memory.

## Sync

- [ ] Each action happens while the narration talks about it, not before and not after.
- [ ] No scene ends on a frozen screen longer than about two seconds.
- [ ] The cursor moves to what the narration names.

## Screen

- [ ] No personal path, user name, token, machine name or private project anywhere, in any frame.
- [ ] Text is readable at the recorded size; overlays do not hide what the narration points at.
- [ ] The 3D view renders smoothly (GPU), with no loading spinner left on screen.

## Audio and captions

- [ ] Names are pronounced right (Flow Tower, YAML, the example names).
- [ ] Loudness is even across scenes (EBU R128 normalisation on export); no clipped words between scenes.
- [ ] The captions match the narration and are in sync.

## Length

- [ ] Total length within the brief's target, under its cap.
