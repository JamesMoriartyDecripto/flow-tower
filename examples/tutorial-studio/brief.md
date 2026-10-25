# Brief

One page that fixes what the tutorial is for before anyone writes a line of narration. The maintainer signs it off;
the outline and the script are checked against it.

## Template

| Field | Answer |
|---|---|
| Product | The web app or repo, and how to run it locally (command, port, seed data) |
| Audience | Who watches, and what they already know |
| Goal | After watching, the viewer can… (one or two verbs: explain, decide, do) |
| Out of scope | What the video leaves to the docs, on purpose |
| Length | Target and hard cap, in minutes |
| Language and voice | Narration language, TTS model and voice, and two alternatives for the pilot |
| Sources of truth | The docs every claim must come from: no feature, key or command that is not in them |
| Screen | Resolution, theme, what must never appear (personal paths, tokens, private projects) |
| Publishing | Where the video goes, captions, where it is linked from |
| Re-render | What change makes the video stale (a release, a UI change) |

## Sign-offs and rounds

Every gate has a cap, so a tutorial that does not converge goes back one step instead of looping.

| Gate | Who | Rounds | After the last round |
|---|---|---|---|
| Brief | maintainer | 1 | Rejected: no video |
| Outline | maintainer | 2 | Back to the brief: the goal or the scope is wrong |
| Voice pilot | maintainer | 3 | Back to the brief: pick another voice or model |
| Final review ([review.md](review.md)) | maintainer | 3 | Back to the outline: the structure is wrong, not the takes |

## Sample: Flow Tower, what towers are and when to use one

| Field | Answer |
|---|---|
| Product | Flow Tower, from a fresh clone: `npm install`, then the CLI serving `examples/` on its own port with an empty `FLOW_TOWER_HOME` |
| Audience | A developer who has just cloned the repo. Knows agents, prompts and tools; has never seen a tower |
| Goal | The viewer can explain what a tower shows, decide whether their project needs one, and start their own from the closest example |
| Out of scope | The team hub, live wiring of each harness, reports, the dev squad, voice commands |
| Length | 6-8 minutes, cap 9 |
| Language and voice | English through OpenRouter: `elevenlabs/eleven-flash-v2.5`, the voice the app already uses for spoken replies; pilot alternatives `elevenlabs/eleven-v4` and `microsoft/mai-voice-2.1` |
| Sources of truth | `README.md` (controls), `docs/what-goes-where.md`, `docs/getting-started.md`, `docs/best-practices.md`, `examples/README.md` |
| Screen | A 1600x900 window, dark theme, the examples gallery only; no user folder, no personal towers |
| Publishing | A release asset or a video host, with SRT captions; linked from the README |
| Re-render | Every release that changes the HUD, the controls or a command shown in the video |
