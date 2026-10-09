# Leafwise 2.4: product spec

Status: approved by product owner (design sign-off round 2). Fictional sample.

## Problem

From review mining (14 competitor x store samples, 3,860 low-star reviews): the top pains are reminders that ignore season and pot size (19%), a paywall before any value (14%), and plant identification that fails on succulents (11%).

## Goals for 2.4

| Goal | Metric | Target (illustrative) |
|---|---|---|
| Reminders people trust | 7-day reminder completion | 55% |
| Value before paywall | trial start after first plant added | 9% |
| Stable release | crash-free sessions | >= 99.5% |

## Scope

1. **Seasonal reminders.** Watering interval adapts to month and pot size.
   - Given a plant with a 7-day summer interval, when the month is December, then the next reminder is scheduled 10-12 days out.
2. **Home-screen widget** (iOS WidgetKit, Android Glance): plants due today, tap to mark watered.
   - Given two plants due, when the user taps "watered" on the widget, then the app shows both events after the next sync.
3. **Paywall after first plant.** Premium unlocks plant ID and unlimited plants. Monthly and annual, 7-day trial on annual.
   - Terms, price per period and trial length visible above the buy button; restore purchases link; close button.
4. **Account deletion in Settings** (App Store 5.1.1(v)): deletes account, photos and purchase link; confirms by email.

Later: diagnosis from photos, shared households, Wear OS.

## Platform notes

- iOS: Sign in with Apple offered next to Google (guideline 4.8). No App Tracking Transparency prompt: we do not track.
- Android: POST_NOTIFICATIONS requested after the first plant is added; predictive back on every screen.

## Analytics events

`plant_added {source}`, `reminder_completed {from: widget|app|notification}`, `paywall_viewed {trigger}`, `trial_started {product}`, `account_deleted`. No free text or email in any property.

## Out of scope for agents

Pricing changes, refund handling, any reply to a billing complaint.
