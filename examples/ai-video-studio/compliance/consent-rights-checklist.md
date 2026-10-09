# Consent & rights checklist (run per video, before client approval)

The `rights` guard checks the machine-readable items; legal counsel signs the rest when the video
uses a real person's likeness or voice, a health or performance claim, or a paid partnership.

## Likeness and voice
- [ ] Every identifiable person on screen or in the audio is in the consent registry.
- [ ] Consent covers this **use** (coaching content / ads), **channel**, **territory** and **date**
      (not expired, not revoked). Ads need their own scope.
- [ ] Voice clone was created with the vendor's verification (ElevenLabs PVC voice captcha read by
      the person) and avatar consent is cleared (HeyGen `consent_status`).
- [ ] The person approved the final script lines spoken by their clone (approvals log).
- [ ] No generated person resembles a real, identifiable individual (frame QA "likeness" flags = 0).
- [ ] No minors, real or generated.

## Generated assets
- [ ] Prompts contain no real people, brands, artists, song titles or copyrighted characters.
- [ ] Vendor terms allow commercial use for every model used (see README sources).
- [ ] Human creative contribution is documented (script, storyboard, selection, edit), since
      prompts alone are not protected by copyright in the US.
- [ ] Provenance sidecar exists for every take (model, version, job id, prompt hash).

## Music and sound
- [ ] Music generated on a plan with commercial licensing (Eleven Music) or from a licensed library;
      licence id recorded below.
- [ ] No lyrics or artist voice references. For Shorts over 60 s, any claim blocks the video.

## Claims and partnerships
- [ ] Every number in VO or on screen has a source in the script.
- [ ] No medical advice; no competitor names; paid partnership toggles set if applicable.

## AI disclosure
- [ ] C2PA manifest signed on every exported file (`pipeline/sign-c2pa.sh`).
- [ ] YouTube "altered or synthetic content" = yes when realistic generated scenes or a cloned
      voice/likeness are used (`status.containsSyntheticMedia`).
- [ ] TikTok `is_aigc: true`; Meta "AI info" label set for photorealistic video / realistic audio.
- [ ] EU audiences: deep-fake style content (realistic people or events) disclosed per AI Act
      Article 50(4), applicable from 2 August 2026; end-card line present.

| Item | Licence / record id | Checked by | Date |
|---|---|---|---|
| Music bed | ELM-2026-10-0417 | rights guard | 2026-10-16 |
| Mara likeness + voice | CR-2026-007 | Elin Sand (legal) | 2026-10-16 |
