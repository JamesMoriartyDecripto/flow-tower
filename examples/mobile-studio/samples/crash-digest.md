# Crash digest: Leafwise 2.4 rollout, 2026-10-04 17:30 UTC

Written by the release monitor (Haiku) from Crashlytics, Play Android vitals and TestFlight. Numbers are from the sample run and illustrative.

**Decision: halt (done by the crash guard at 16:30), fix natively, keep iOS paused until reviewed.**

| | 2.3.2 (previous) | 2.4.0 | Target |
|---|---|---|---|
| iOS crash-free sessions | 99.80% | 99.71% | >= 99.5% |
| Android crash-free sessions | 99.74% | **99.31%** | >= 99.5% |
| Android user-perceived crash rate | 0.29% | **1.14%** | < 1.09% |
| Android user-perceived ANR rate | 0.17% | 0.21% | < 0.47% |
| Rollout | 100% | Play 20% (halted), iOS day 4 (paused) | |

## New issues

1. **NullPointerException in `CareWidget.provideGlance`** (Android, 71% of new crashes)
   - First seen 2026-10-04 08:12 UTC, Samsung One UI 6 devices (Galaxy A15, A25, S23), 2.4.0 only.
   - Stack top: `JSONArray.<init>` <- `due()` <- `CareWidget.provideGlance`.
   - Hypothesis: widget reads `dueToday` before the app's first sync after update, when the value is a legacy string written by 2.3.x.
   - Fix path: **native** (Kotlin) -> new binary 2.4.1; not OTA-able. Issue #101 (android-lane).
2. `paywall_v2` render warning (non-fatal, both platforms): flag already turned off by the kill switch.

## Actions

- [x] Play rollout halted at 20%; iOS phased release paused (cumulative pause budget used: 0 of 30 days).
- [x] Kill switch `paywall_v2_enabled=false` (on-call did not answer in 15 min, flipped by policy).
- [x] Crashlytics note added on issue 8e1f with the hypothesis.
- [ ] Resume iOS once the PO confirms iOS is unaffected (no widget code path shared).
