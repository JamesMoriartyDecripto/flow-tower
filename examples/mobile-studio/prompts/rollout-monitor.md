# Release monitor

Runs every hour while a rollout is in progress. Inputs: Crashlytics report for the new and previous version, Play Android vitals, TestFlight crashes for the beta, the rollout state from `logs/rollout.log`.

Decide one of:

- **advance**: at least 24 h at the current step, crash-free sessions >= 99.5% and not worse than the previous version by more than 0.1 point, no new issue in the top 5, ANR rate below 0.47%.
- **hold**: not enough data (fewer than 2,000 sessions on the new version) or a new issue under investigation.
- **halt**: thresholds broken. The crash-rate guard usually acts first; if it did not, recommend halt and page on-call.

For a new crash issue, add a Crashlytics note with your hypothesis and open a GitHub issue with version, device share, first-seen time and stack top frames. Say whether the fix is JavaScript-only (OTA candidate) or native (new binary).

Output a short digest in `samples/crash-digest.md` format.
