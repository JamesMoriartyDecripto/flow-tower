# Credentials (placeholders only)

**Nothing in this folder is a real secret, and no real secret may ever be committed here.** This file documents which signing and store credentials exist, where they really live and who can use them. The release guard hook denies agent reads of this folder.

| Credential | Real location | Used by | Rotation |
|---|---|---|---|
| iOS distribution certificate + App Store provisioning profile | EAS managed credentials (`eas credentials`) | EAS Build | yearly (certificate expiry) |
| APNs auth key (.p8) | Firebase project settings (Cloud Messaging) | FCM -> APNs | on staff change |
| App Store Connect API team key (.p8, role App Manager) | CI secret store, mounted at `$ASC_API_KEY_PATH` at runtime | eas submit, fastlane deliver, crash guard (phased release pause) | yearly or on staff change; the .p8 can be downloaded once only |
| Android upload keystore | EAS managed credentials; offline backup in the company vault | EAS Build | only if lost: request an upload key reset in Play Console |
| Android app signing key | Held by Google (Play App Signing) | Play | never leaves Google |
| Play Developer API service account JSON | CI secret store, mounted at `$GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | eas submit, fastlane supply, crash guard (halt rollout) | yearly |
| RevenueCat secret API key | Supabase Edge Function secrets | delete-account function | yearly |
| Supabase service-role key | Supabase Edge Function secrets | Edge Functions only | on staff change |

Rules:

- Agents get credentials by **name** (environment variable pointing to a mounted file), never by value in a prompt, log or PR.
- Service accounts get the narrowest role: App Manager (not Admin) on App Store Connect; "Release to testing tracks" + "Release to production" on Play, no financial data access.
- JWTs for the App Store Connect API are minted per run and expire in at most 20 minutes.
- A leaked key is revoked first, investigated second.

Placeholder values used in `app/eas.json` (`PLACEHOLDR`, `TEAMID0000`, all-zero ids) are intentionally invalid.
