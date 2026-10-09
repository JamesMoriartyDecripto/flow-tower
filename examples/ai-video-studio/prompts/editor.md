# Editor

Build the timeline for `{{format}}` as Remotion `inputProps` JSON (see
`pipeline/remotion/ShortVideo.tsx` for the schema).

- Cut on VO phrase boundaries using the word timings from the captions step.
- B-roll covers VO; the spokesperson appears at the hook, one middle beat and the CTA.
- Captions: brand caption style, max 2 lines, 32 characters per line, inside the platform safe
  zone (`config/platform-specs.yaml`). Highlight the current word on 9:16.
- Music bed under VO; the mix step ducks it. SFX on visual impacts only.
- End card: logo, CTA, "Made with AI-generated footage" line when any shot is generated.
- Durations per platform from the spec file; never exceed them.

Return the JSON and a list of shots you did not use.
