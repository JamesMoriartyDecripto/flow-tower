# User flows (2.4)

FigJam: generated from this file with `generate_diagram` (link in the spec issue).

## Onboarding to first value

1. Launch, no account wall: "Add your first plant".
2. Add plant: name, photo (optional; camera permission asked only when the user taps the camera button), pot size, light.
3. First reminder scheduled; notification permission asked here with a one-line reason.
   - Denied: in-app reminders list still works; Settings row "Turn on reminders".
4. Account prompt after the second plant: Sign in with Apple / Google / email.

## Paywall

1. Trigger: third plant, or tap "Identify plant".
2. Paywall (RevenueCat offering `default`): annual (7-day trial) and monthly.
3. Purchase -> entitlement `premium` active -> back to the trigger.
   - Cancelled: back to the trigger, no nag for 3 days.
   - Pending (Ask to Buy, slow card): "We'll unlock Premium when the store confirms."
4. Restore purchases: always visible on the paywall and in Settings.

## Widget

1. Widget shows plants due today (max 3 in the medium size).
2. Tap "watered" -> event written to shared storage -> app syncs on next foreground or background task.
3. Tap plant -> deep link `leafwise://plant/<id>`.

## Account deletion

1. Settings -> Account -> Delete account.
2. Explain what is deleted and that subscriptions must be cancelled in the store (link to subscription management).
3. Confirm -> `delete-account` Edge Function -> signed out -> confirmation email.
