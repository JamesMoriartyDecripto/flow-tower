# Privacy forms checklist (Leafwise 2.4)

One SDK inventory feeds three declarations: Apple **App Privacy details**, the iOS **privacy manifest** (`ios.privacyManifests` in `app/app.json`) and Google Play's **Data safety** form. Re-run on every release with a new or updated SDK. Reviewed by the privacy lead before submission.

## SDK inventory

| SDK | Data leaving the device | Purpose | Linked to user | Tracking |
|---|---|---|---|---|
| Supabase (auth, DB, storage) | email, user id, plant photos, care events | App functionality | yes | no |
| RevenueCat | user id, purchase history | App functionality (subscriptions) | yes | no |
| Firebase Crashlytics | crash logs, device model, OS, app instance id | Analytics (diagnostics) | no | no |
| Firebase Analytics (after consent in EU) | app instance id, product interaction events | Analytics | no | no |
| Firebase Cloud Messaging | push token | App functionality | yes | no |
| Firebase Remote Config | app instance id | App functionality | no | no |

## Apple App Privacy

- [x] Contact Info > Email Address: App Functionality, linked.
- [x] User Content > Photos or Videos: App Functionality, linked.
- [x] Identifiers > User ID: App Functionality, linked.
- [x] Purchases > Purchase History: App Functionality, linked.
- [x] Usage Data > Product Interaction: Analytics, not linked.
- [x] Diagnostics > Crash Data, Performance Data: Analytics, not linked.
- [x] "Used to track you": **none**. No App Tracking Transparency prompt; AD_ID permission blocked on Android.
- [x] Privacy manifest declares required-reason APIs (UserDefaults CA92.1); third-party SDK manifests checked in their pods.
- [x] Every permission has a purpose string (camera, photo library).

## Google Play Data safety

- [x] Collected: Personal info (email), Photos, App activity (app interactions), App info and performance (crash logs, diagnostics), Device or other IDs, Financial info (purchase history).
- [x] Shared: none (Supabase, RevenueCat and Firebase act as service providers on our behalf).
- [x] Encrypted in transit: yes.
- [x] Users can request deletion: yes, in-app (Settings > Account > Delete account) and by email; web deletion link provided in Play Console.
- [x] Optional vs required: analytics optional (consent), everything else required for core features.

## GDPR

- [x] Lawful basis: contract (account, reminders, subscription), consent (analytics), legitimate interest (crash reports).
- [x] Consent screen before Analytics in the EU/EEA; analytics collection disabled by default until consent.
- [x] Records of processing and DPAs on file for Supabase, RevenueCat, Google.
- [x] Retention: account data deleted within 30 days of deletion request; analytics events 2 months; crash data 90 days.
- [x] Privacy policy URL reachable from the app and both listings; matches this checklist.

Sign-off: privacy lead, 2026-09-29 (approval id in the release issue).
