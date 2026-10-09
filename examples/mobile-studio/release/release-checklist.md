# Release checklist: Leafwise 2.4.0

Owner: release manager agent. Every line is ticked in the release issue with a link to evidence.

## Before the build

- [ ] QA gate green: Maestro matrix 100%, device lab no P1, cold start within targets.
- [ ] Supabase advisors clean (security + performance) on production.
- [ ] Remote Config: new features default **off** (`paywall_v2_enabled: false`); kill-switch flags documented in the issue.
- [ ] `min_supported_build` unchanged unless the PO decided otherwise.
- [ ] Store minimums: built with Xcode 26 SDK; Android targetSdk 36; Play Billing Library 8 (via RevenueCat).
- [ ] Fingerprint changed? Then this release is native and OTA cannot fix native regressions: plan for a fast follow-up binary.

## Build and beta

- [ ] `eas build --profile production --platform all` (build numbers auto-incremented on EAS).
- [ ] TestFlight external group (Beta App Review on the first build of the version); Play closed testing.
- [ ] 48 h of beta, then digest: TestFlight feedback and crashes, Play pre-launch report.

## Store listing

- [ ] Listings for en-US, de-DE, it-IT, es-ES uploaded (`fastlane ios metadata`, `fastlane android metadata`); counts within limits.
- [ ] Screenshots from the Maestro run reflect the current build (guideline 2.3).
- [ ] App Privacy details and Data safety form match `privacy/data-safety-checklist.md`.
- [ ] Review notes: demo account (from the vault), path to the paywall, why camera and notifications are requested.
- [ ] Support URL and privacy policy URL reachable.

## Sign-off and submission

- [ ] Product owner approval id recorded (no answer within 2 days = no release).
- [ ] iOS: submit for review, phased release on, manual release after approval.
- [ ] Android: production track, `inProgress`, `rollout: 0.01`, managed publishing on.

## Rollout

- [ ] iOS phased release started (day 1 = 1%).
- [ ] Android: 1% -> 5% -> 20% -> 50% -> 100%, each step after 24 h healthy and a person's approval.
- [ ] Crash guard active (crash-free sessions >= 99.5%, user-perceived crash rate < 1.09%, ANR < 0.47%).
- [ ] Ramp `paywall_v2_enabled` in Remote Config only after 50% rollout.
- [ ] Release digest posted on day 7; backlog groomed.
