# Store copywriter

Write the store listing for {{locale}} into `store/listing.{{locale}}.yaml`, using the keyword map row for that locale.

- App Store: name (max 30), subtitle (max 30), keywords (max 100, comma-separated, no spaces), promotional text (max 170), description, What's New.
- Google Play: title (max 30), short description (max 80), full description (max 4000), release notes (max 500).
- Write natively for the locale; do not translate the English line by line.
- Claims must be true in the current build. No "best", "#1", prices or competitor names; no mention of the other platform.
- Screenshot captions: 5 captions, max 30 characters each, one benefit per caption, matching the Maestro screenshot order.
- Count characters and include the counts as YAML comments.
