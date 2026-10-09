# Mobile App Studio

A studio pipeline that takes a mobile app from idea to both stores and keeps it healthy after launch: store research and ASO, spec and Figma design checked against Apple's Human Interface Guidelines and Material 3, an architecture decision, a Supabase / RevenueCat / Firebase backend, a shared Expo app plus **iOS and Android lanes** (each a sub-tower), device QA, TestFlight and Play beta, store review with a rejection loop, then a phased / staged rollout guarded by a crash-rate check, a kill switch and over-the-air fixes. Sample app: **Leafwise** (fictional), a plant-care app with reminders, a home-screen widget and a subscription, in en-US, de-DE, it-IT and es-ES.

```bash
node bin/flow-tower.js examples/mobile-studio
```

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Discovery & ASO | Slack idea → Opus studio lead spawns competitor scans (fan-out 4–8), review mining (Haiku, competitor × store) and keyword maps per locale (Appfigures MCP) → product owner go / no-go (max 2 pivots). |
| 2 | Product & Design | Spec + user flows (incl. account deletion, restore purchases) → Figma design with iOS and Android variants → tokens.json → HIG / Material 3 / accessibility guard → design sign-off (max 3 rounds). |
| 3 | Architecture & Backend | Scored ADR (native vs Expo vs Flutter vs KMP), approved by the tech lead → Supabase Postgres with RLS (PII, EU), Auth + in-app deletion, FCM/APNs push, RevenueCat (StoreKit 2 / Play Billing 8, webhook), Remote Config flags. |
| 4 | Build | Shared contract → Expo app lead → **iOS lane** (`towers/ios.tower.yaml`: widget target, privacy strings, StoreKit config, Xcode MCP + MobileBuildMCP, XCUITest, real iPhone) and **Android lane** (`towers/android.tower.yaml`: Glance widget as a local Expo module, Android CLI inspections, Play policy check, R8 build, mobile-mcp, Compose UI test, real Galaxy A15) → code review (max 3 rounds). |
| 5 | QA & Devices | PR checks on GitHub Actions (fingerprint diff flags native changes) → EAS preview builds → Maestro flows on a cloud device matrix (fan-out) + device-lab agent with VoiceOver/TalkBack + performance (cold start, size) → release-ready gate. |
| 6 | Release & Store Review | Code signing (EAS-managed, secrets) → store builds → TestFlight + Play closed testing → listings per locale (fan-out 4) + privacy forms (privacy lead) → **product owner sign-off** (no answer = no release) → App Review (SLA 48h) and Play review (SLA 72h) → rejected? → rejection responder → resubmit (max 3). |
| 7 | Rollout, Monitoring & Iteration | iOS 7-day phased release and Play staged rollout (`rollout: staged` with steps) → Crashlytics + consented Analytics → **crash-rate guard** halts Play and pauses the phased release → kill switch (Remote Config, `on_timeout: approve`) → monitor → JS-only fixes via EAS Update (10% rollout), native fixes back to store builds → review triage with approved replies → backlog → next version. |
| 8 | Tools, Models & Guardrails | Expo, Figma, device (mobile-mcp + Maestro) and Firebase MCP servers, release guard hook, studio memory, Opus / Sonnet / Haiku 5.5. |

64 nodes in the main tower, 13 in the iOS lane, 12 in the Android lane. Runtimes show where each piece runs: `mac` (local, Xcode 26.4 + Android tooling), `orchestrator` (container), `gha` (CI), `eas` (cloud builds, submit, OTA), `device-lab`, `testers` and `users` (devices), `maestro-cloud`, `asc`, `play`, `firebase`, `revenuecat`, `figma`, `appfigures` (SaaS) and `supabase` (cloud, EU).

## Operational features exercised

- `approval`: go / no-go (2 `rounds`), design (3 `rounds`, `via` Figma prototype + Slack), ADR, privacy lead, release sign-off (`on_timeout: reject`), reply approval (`per: reply`, `wait`), kill switch (`on_timeout: approve`, fail-safe).
- `decision` typed outputs: stack choice (with its candidates), store verdict (binary), fix path (OTA update or store build).
- `limits`: store review timeouts (4d / 7d), build timeouts and retries, `max_iterations` on code review, QA and resubmissions; `ttl` on device sessions.
- `sla`: App Review 48h and Play review 72h as `external` waits `after: submission`, beta 5d. `trigger`: chat, cron (monitor hourly, guard every 30 min, triage daily), GitHub events.
- `fanout`: competitors, `[competitor, store]`, locales, platforms, `[device, OS version]`, `[store, locale]`, stores. `budget` per agent with `on_exceed`.
- `data`: PII in Postgres (30d `retention_after: account deletion`), auth and Analytics (EU, `lawful_basis: consent`), confidential purchase history, `secret` signing material. `credentials`: `service` for store APIs and submit, `user` for Figma, Expo and Supabase OAuth.
- `sandbox` allowlists for every coding agent; `version` + `rollout`: `staged` with `steps` on both stores (App Store 1-2-5-10-20-50-100 %, Play 1-5-20-50-100 %), `metric` and crash-rate `guard`, canary 10 % OTA, previous version; edge `protocol` (`mcp`, `http`, `webhook`, `stdio`).
- `evals` (all `illustrative: true`, with `unit`): contrast failures and touch targets, Maestro pass rate, unlabeled controls, cold start, download size, crash-free sessions ≥ 99.5%, Android vitals crash rate < 1.09% and ANR < 0.47% (`higher_is_better: false`), crash-free users, store rating, review reply time.

## Files

Prompts per agent (`prompts/`), spec, flows and ADR (`specs/`), design tokens, `app/app.json` and `app/eas.json`, purchases and flags modules, iOS widget target (Swift) and Android Glance module (Kotlin), XCUITest and Compose UI test, Supabase schema with RLS and two Edge Functions, Fastlane metadata/rollout lanes, two Maestro flows and the device matrix, the CI workflow, listings per locale, privacy / data-safety checklist, release checklist, a credentials map (placeholders only), the crash guard and rollout scripts, build / store-review / rollout logs, and sample opportunity brief, crash digest and review digest.

## Sources (opened Oct 2026)

- Xcode 26.3 agentic coding, MCP: https://www.apple.com/newsroom/2026/02/xcode-26-point-3-unlocks-the-power-of-agentic-coding/ and https://www.anthropic.com/news/apple-xcode-claude-agent-sdk; `claude mcp add --transport stdio xcode -- xcrun mcpbridge`: https://swiftjectivec.com/Agentic-Coding-Codex-Claude-Code-in-Xcode/ ; the 20 bridge tools (BuildProject, RunAllTests, RenderPreview, DocumentationSearch...), listed by Cursor rather than Apple: https://cursor.com/docs/integrations/xcode
- MobileBuildMCP (formerly XcodeBuildMCP, Sentry): https://github.com/getsentry/XcodeBuildMCP
- Android CLI 1.0 for agents: https://android-developers.googleblog.com/2026/05/android-cli-stable-1-0-agent-development.html
- Expo MCP server: https://docs.expo.dev/eas/ai/mcp ; SDK 56/57 notes and version table: https://expo.dev/changelog/sdk-56 , https://docs.expo.dev/versions/latest/
- EAS Update and rollouts: https://docs.expo.dev/eas-update/introduction/ , https://docs.expo.dev/eas-update/rollouts/ ; eas.json submit fields: https://docs.expo.dev/eas/json/
- mobile-mcp: https://github.com/mobile-next/mobile-mcp ; Maestro MCP: https://docs.maestro.dev/get-started/maestro-mcp
- Figma MCP tools: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ ; Supabase MCP: https://supabase.com/docs/guides/getting-started/mcp ; RevenueCat MCP: https://www.revenuecat.com/docs/tools/mcp ; Crashlytics MCP: https://firebase.google.com/docs/crashlytics/ai-assistance-mcp ; Appfigures for agents: https://help.appfigures.com/en/article/appfigures-for-ai-agents-1chf6wf/
- App Review (common rejections, review times): https://developer.apple.com/distribute/app-review/ ; App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/ ; upcoming requirements: https://developer.apple.com/news/upcoming-requirements/ ; App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Phased release: https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/ ; API keys: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api
- Play staged rollouts: https://support.google.com/googleplay/android-developer/answer/6346149 and API: https://developers.google.com/android-publisher/tracks ; reviews API: https://developers.google.com/android-publisher/reply-to-reviews ; Data safety: https://support.google.com/googleplay/android-developer/answer/10787469 ; testing requirements: https://support.google.com/googleplay/android-developer/answer/14151465 ; target SDK: https://developer.android.com/google/play/requirements/target-sdk ; Billing Library deadlines: https://developer.android.com/google/play/billing/deprecation-faq ; Android vitals thresholds: https://developer.android.com/topic/performance/vitals
- Fastlane match and supply: https://docs.fastlane.tools/actions/match/ , https://docs.fastlane.tools/actions/upload_to_play_store/ ; Sentry release health definitions: https://docs.sentry.io/product/releases/health/ ; Compose Multiplatform iOS stable: https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/

## What is illustrative

The app, studio, people, ids, URLs and all metrics are fictional: eval values, keyword volumes, review counts, costs, build times and the rollout incident in the logs. The store thresholds are real (Android vitals 1.09% / 0.47%, phased release 1-2-5-10-20-50-100% over 7 days with a 30-day pause budget, App Review 90% within 48 h); the 99.5% crash-free target is a studio choice. Credential files are not included; `credentials/README.md` maps where real ones live.
