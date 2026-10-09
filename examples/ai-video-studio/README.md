# AI Video Studio

An agentic production line from brief to published short-form and long-form video, with the
client signing off at each phase. A Claude Agent SDK **producer** (Opus 5.5) runs research and
hook testing, scripts with per-platform variants, and a storyboard that becomes a priced shot
list. Every shot then fans out into its own **async generation pipeline** (sub-tower), next to
voice, music and avatar jobs. The edit is a timeline written as data and rendered by Remotion
on Lambda; FFmpeg mixes and reframes per platform. QA ends with C2PA Content Credentials, the
platform AI disclosures and client approval, then packaging, uploads and analytics that feed
the next brief.

Sample client: **Kestrel Trail Co.** (fictional), campaign "Your First Ultra". Spokesperson
**Mara Lindqvist** (fictional) has a consent record covering her likeness and cloned voice.

```bash
node bin/flow-tower.js examples/ai-video-studio
```

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Brief & Research | Slack `/brief` (chat) or weekly calendar (cron) → Haiku intake → route (declines real people without consent, political, medical) → Opus producer → researchers (fan-out 3–5) and hook lab → client direction sign-off (48 h, escalate). |
| 2 | Script & Storyboard | Master script → variants per format (fan-out) → claims guard → storyboard → `shots.json` → cost estimate → within budget? → script sign-off (max 3 rounds). |
| 3 | Asset Generation | Job dispatcher (concurrency 4, budget $90, pause) → **shot pipeline** per shot (fan-out 6–24, sub-tower) + ElevenLabs voice (PVC, MCP) + HeyGen avatar (callback webhook) + Eleven Music + SFX; consent registry (PII, 1095 d) checked before every voice or avatar job. |
| 4 | Edit & Assembly | Editor agent writes Remotion `inputProps` → Remotion Lambda (webhook) → FFmpeg sidechain ducking + two-pass loudnorm → whisper-1 word timestamps for captions → reframe per platform (fan-out) → producer rough-cut review. |
| 5 | QA & Compliance | Frame QA (vision), brand guard, rights & consent, platform specs → gate (3 fix rounds; can send a shot back to generation) → C2PA signing + disclosure flags → legal review when a likeness or claim is used (24 h, reject on timeout) → client approval (max 3 rounds, SLA 72 h). |
| 6 | Packaging & Publishing | Titles/copy, 3 thumbnails (A/B rollout), schedule, YouTube `videos.insert` (`containsSyntheticMedia`), TikTok direct post (`is_aigc`), Instagram Reels container flow. |
| 7 | Analytics & Iteration | Daily metrics pull, YouTube Test & compare, analyst with evals (hook rate, % viewed, CTR, AVD, cost per finished minute), cost ledger, weekly digest, next brief → learnings. |

**Sub-tower `towers/shot.tower.yaml`** (one run per shot): shot row + approved refs → compose
prompt → shot kind? → keyframe (Nano Banana 2) → shot budget guard ($6, downgrade) → Veo 3.1 /
Runway fallback / Luma (experimental) → job poller (10 s, backoff, 10 min timeout) → ffprobe →
vision check → score ≥ 7? (3 takes) → keep take with provenance, or escalate to the producer.

## Operational features exercised

- `trigger`: chat (Slack), cron (calendar, analytics), and webhooks on edges.
- `approval` on direction, script, rough cut, legal and final; `timeout` 8 h–48 h, `on_timeout` escalate or reject; `limits.max_iterations: 3` for revision rounds, QA fixes and takes.
- `fanout`: research questions, formats, shots (6–24), platforms, thumbnails (3).
- `limits`: async job `timeout` (Veo 10 m, HeyGen 30 m, Lambda 15 m), `retries` + `backoff`, `concurrency` (Veo jobs, Lambda), `ttl` (TikTok upload URL 1 h).
- `budget`: producer $150 (pause), dispatcher $90 (pause), per shot $6 (`downgrade` tier).
- `data`: PII on the consent registry, voice clone and avatar; confidential briefs and takes.
- `credentials`: `service` for vendor API keys, `user` for the client's YouTube/TikTok/Instagram OAuth.
- `evals`, `version` + `rollout: ab` (thumbnails), `sla` (legal, final, Test & compare), `status: experimental` (Luma), edge `protocol` (`http`, `webhook`, `mcp`).

## Files

`prompts/` 11 agent prompts · `briefs/` template + structured sample · `research/hook-bank.md` ·
`content/` script, storyboard, shot list JSON · `config/` platform specs, brand kit, vendor
rates · `compliance/` consent & rights checklist, consent record, C2PA manifest ·
`pipeline/` cost estimate, job poller, webhook receiver, Remotion composition + Lambda render,
captions (whisper-1), FFmpeg mix and reframe, spec check, C2PA signing, YouTube and TikTok
publishing · `logs/` render jobs, approvals, publishing · `analytics/` week-1 sample ·
`memory/learnings.md` · `CLAUDE.md`.

## Tool choices (checked 2026-10-09)

| Need | Used | Notes |
|---|---|---|
| Video | Veo 3.1 (`veo-3.1-generate-preview`, `-fast-`, `-lite-`) on the Gemini API | $0.40 / $0.10–0.12 / $0.05–0.08 per second (1080p ≤ $0.40); 4/6/8 s, 24 fps, 9:16 or 16:9, native audio, SynthID; long-running operation, 11 s–6 min, files kept 2 days. |
| Video fallback | Runway API `gen4.5` (12 credits/s), `gen4_turbo` (5) at $0.01/credit | Runway also resells Veo 3.1 and others. |
| Video (trial) | Luma `ray-3.2` (Agents API) | Polling only; price not on the page we read. |
| Not used | OpenAI Sora 2 | The Videos API was **shut down on 2026-09-24** per OpenAI's guide. |
| Not verified | Kling, Pika | Kling: only third-party proxy docs found; Pika: not checked. Treat as "other video model APIs". |
| Images | Nano Banana 2 (`gemini-3.1-flash-image`), Nano Banana Pro (`gemini-3-pro-image`) | ~$0.067 and $0.134 per 1K image. |
| Voice | ElevenLabs TTS (v4 $0.08/1k chars, promo $0.022 until Oct 12), Professional Voice Clone with voice-captcha verification | Remote MCP `https://api.elevenlabs.io/v1/mcp` (OAuth). |
| Music / SFX | Eleven Music `music_v2_5` ($0.15/min, 3 s–5 min, "cleared for nearly all commercial uses"); Lyria 3.5 ($0.08/song, SynthID) as fallback; SFX $0.12/min | Lyria blocks artist voices and copyrighted lyrics. |
| Avatar | HeyGen v3 API (`callback_url` webhooks, avatar consent endpoint) | v1/v2 supported until 2026-10-31; remote MCP `https://mcp.heygen.com/mcp/v1/`. Synthesia API (`/v2/videos`, per-minute pricing) is the alternative. Price per minute is plan-dependent: our $3/min is an assumption. |
| Edit | Remotion Lambda (company licence for 4+ people; automators $0.01/render, $100/month min) + FFmpeg | Shotstack (Edit API, callbacks retried up to 10× with backoff, unsigned; $0.05–0.20/min) is the hosted alternative. |
| Captions | OpenAI `whisper-1` (word/segment timestamps, 25 MB limit) | Price not checked; budgeted as an assumption. ElevenLabs Scribe v2 is $0.22/hour. |
| Provenance | c2patool + IPTC `digitalSourceType` (`trainedAlgorithmicMedia`, `compositeWithTrainedAlgorithmicMedia`) | Embeds in MP4 (BMFF). |

## Rules this preset encodes

- **YouTube**: disclose realistic AI-generated or altered content (real people saying things they did not, altered real events, realistic scenes, music as the focus); exempt: AI help with scripts, titles, thumbnails, captions, and cloning *your own* voice. C2PA metadata can trigger an automatic label. API field `status.containsSyntheticMedia`. Shorts up to 3 min; Shorts over 1 min with any copyright claim are blocked globally.
- **TikTok**: `is_aigc` adds the "AI-generated" label; unaudited API clients can post only privately. C2PA auto-labelling announced in 2024 (news coverage, not a primary source).
- **Meta**: may require the "AI info" label on photorealistic video or realistic-sounding audio (from the help-centre snippet in search results; the page itself did not render for us).
- **EU AI Act Art. 50** (applies from 2 Aug 2026): providers mark synthetic output in a machine-readable way; deployers disclose deep fakes (lighter duty for evidently artistic or satirical work). The Commission's voluntary Code of Practice on marking and labelling was published 10 June 2026.
- **Copyright (US)**: prompts alone do not make an output protectable; human selection, arrangement and modification can. Hence the documented human edit and approvals log.
- **Likeness and voice**: vendor-side consent (HeyGen `consent_status`, ElevenLabs PVC verification) plus our own registry with scope, territory and expiry; the person approves the lines her clone speaks.

## Sources opened

- Veo on the Gemini API: https://ai.google.dev/gemini-api/docs/veo · pricing: https://ai.google.dev/gemini-api/docs/pricing · Lyria: https://ai.google.dev/gemini-api/docs/music-generation
- OpenAI video guide (Sora shutdown notice): https://developers.openai.com/api/docs/guides/video-generation · speech to text: https://developers.openai.com/api/docs/guides/speech-to-text
- Runway API pricing: https://docs.dev.runwayml.com/guides/pricing/ · Luma: https://docs.agents.lumalabs.ai
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api · PVC: https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning · music: https://elevenlabs.io/docs/overview/capabilities/music · MCP: https://github.com/elevenlabs/elevenlabs-mcp
- HeyGen: https://developers.heygen.com/docs · avatars and consent: https://developers.heygen.com/docs/create-avatar · MCP: https://developers.heygen.com/mcp/overview · Synthesia: https://www.synthesia.io/api
- Remotion Lambda: https://www.remotion.dev/docs/lambda · renderMediaOnLambda: https://www.remotion.dev/docs/lambda/rendermediaonlambda · webhooks: https://www.remotion.dev/docs/lambda/webhooks · licence: https://www.remotion.pro/license
- Shotstack pricing: https://shotstack.io/pricing/ · webhooks: https://shotstack.io/docs/guide/architecting-an-application/webhooks/
- C2PA 2.2: https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html · c2patool usage: https://raw.githubusercontent.com/contentauth/c2patool/main/docs/usage.md · IPTC digital source types: https://cv.iptc.org/newscodes/digitalsourcetype/
- YouTube disclosure: https://support.google.com/youtube/answer/14328491 · Test & compare: https://support.google.com/youtube/answer/13861714 · Shorts: https://support.google.com/youtube/answer/15424877 · videos.insert: https://developers.google.com/youtube/v3/docs/videos/insert
- TikTok Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started · direct post reference: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- EU AI Act Art. 50: https://artificialintelligenceact.eu/article/50/ · Code of Practice: https://digital-strategy.ec.europa.eu/en/news/commission-publishes-code-practice-marking-and-labelling-ai-generated-content
- US Copyright Office, Part 2: https://www.copyright.gov/newsnet/2025/1060.html

## What is illustrative

The client, people, consent record, licence ids, job ids, logs, analytics and every `evals`
value are fictional. Vendor prices and limits come from the pages above on 2026-10-09 (some are
promotional or "preview" models and will change). Avatar and Whisper rates in
`config/model-rates.yaml`, the expected takes per tier, safe zones and loudness targets are
studio assumptions, marked as such in the files.
