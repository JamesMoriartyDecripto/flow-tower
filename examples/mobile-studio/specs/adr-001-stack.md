# ADR-001: App stack

Status: accepted (tech lead, PR #12). Date: 2026-07-02.

## Context

Two platforms, a team of one TypeScript-heavy app lead plus agents, a spec that needs home-screen widgets on both platforms, subscriptions, push and fast bug fixes. Store minimums this year: Xcode 26 SDK for uploads (from 28 Apr 2026), Android targetSdk 36 for updates (from 31 Aug 2026), Play Billing Library 8.

## Options and scores (1-5)

| Criterion | Native (SwiftUI + Compose) | Expo / React Native | Flutter | Kotlin Multiplatform |
|---|---|---|---|---|
| Team skills | 2 | 5 | 2 | 3 |
| Shared code | 1 | 4 | 5 | 4 (logic), 4 (Compose Multiplatform UI) |
| Native surface (widgets, billing) | 5 | 4 (native targets / modules) | 3 | 4 |
| Over-the-air bug fixes | 1 | 5 (EAS Update, JS only) | 2 | 1 |
| Agent tooling today | 4 (Xcode MCP, Android CLI) | 5 (Expo MCP + both native toolchains) | 3 | 3 |
| Total | 13 | 23 | 15 | 15 |

## Decision

Expo SDK 57 (React Native 0.86, New Architecture, Hermes v1) with Continuous Native Generation. Native widget code in `app/targets` (iOS, `@bacons/apple-targets`) and `app/modules` (Android, local Expo module). Builds, submission and OTA on EAS.

## Consequences

- `ios/` and `android/` are generated; native changes go through config plugins and modules.
- OTA updates may only fix bugs in JavaScript and assets; the runtime version uses the `fingerprint` policy so an update never reaches an incompatible binary.
- Two Claude Code lanes (iOS, Android) own native work; the app lead owns TypeScript.

## Revisit when

More than 30% of new screens need native UI, or startup on low-end Android misses 2 s p50 for two releases.
