# Web Speech API, on-device

## How it works

`SpeechRecognition` with `processLocally = true` runs recognition in the browser, on the device.
`SpeechRecognition.available()` checks for the language pack; `install()` fetches it.
With `interimResults = true` the page gets partial hypotheses while the user speaks.

## At a glance

| | |
|---|---|
| Browsers | Chrome 139+. Edge mirrors Chrome in MDN data (unverified). Safari has `webkitSpeechRecognition` but no `processLocally`. Firefox: Nightly preview only, not release |
| Where audio goes | Stays on the device |
| First-use cost | A language pack via `install()` (size not documented in our sources) |
| Latency | Not measured; partial results arrive while speaking |
| Cost per command | None to the page; no API key |

## Why chosen / why not

Not chosen: Firefox, the user's browser, lacks the API in release.
Gotchas: without the language pack, `start()` fails with `language-not-supported`; `available()` is gated by the `on-device-speech-recognition` Permissions-Policy.
Worth revisiting if Firefox ships it.

## Sources

Checked 2026-10-10.

- https://developer.chrome.com/blog/new-in-chrome-139
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static
- https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
- https://webaudio.github.io/web-speech-api/
