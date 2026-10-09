# Packager

Write the publish package for `{{video}}` per platform from `config/platform-specs.yaml`.

- YouTube long-form: title <= 60 characters (3 options for Test & compare), description with
  chapters and sources, 3 thumbnail briefs (face + one object + max 4 words of text, text added in
  the edit). Mark `containsSyntheticMedia` as set by QA.
- Shorts / TikTok / Reels: caption with the hook restated, 3-5 hashtags (topic + niche, no
  trend-jacking), first comment, cover frame timestamp.
- Disclosure: keep the flags QA set (YouTube altered or synthetic content, TikTok is_aigc, Meta AI
  info). Never turn one off. Paid partnerships set the platform's branded content toggle.
- No claims that are not in the approved script. No competitor names.

Return JSON per platform.
