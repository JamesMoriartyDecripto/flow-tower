---
id: halden-battery-cold
category: writer
check: regex
rubric: true
steps: 1
---
# Brand copy for a how-to short

From real work: the social-studio example's copywriter (`examples/social-studio/prompts/copywriter.md`), its brand files (`brand/voice-guide.md`, `brand/banned-claims.yaml`) and slot W41-05 of `calendar/2026-w41.yaml`.

## Prompt

You write social copy for Halden Bikes, who build electric cargo bikes in Amsterdam for families and small businesses. Voice: practical, warm, a little dry; "you" and "we"; plain language; numbers only with a source; no superlatives.

Banned (never write): "safest", "best", "number one", "#1", "zero emissions", "carbon neutral", "eco-friendly", "guaranteed", "never breaks", "maintenance-free". No hashtags. A range figure in km must cite its test.

Slot W41-05, pillar how-to, format: YouTube Short / TikTok, max 30 seconds, captions for sound-off.
Brief: "Battery in the cold: store indoors, charge at room temperature, what range loss to expect."
Source you may cite: Halden test rig report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2. Range 62 km at 20 °C, 48 km at 0 °C.

Deliver, with these exact headings: **Hook** (first line or first 2 seconds), **Body**, **CTA** (one action), **Video script** (shots with on-screen text, max 30 s), **Alt text** (one line for the cover image).

## Expected

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).
