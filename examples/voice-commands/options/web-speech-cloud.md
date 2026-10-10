# Web Speech API, server-based (Chrome default)

## How it works

`SpeechRecognition` without `processLocally` uses server-based recognition in Chrome.
The browser sends the audio to a web service (Google's, in Chrome). There is no offline mode.
Safari exposes `webkitSpeechRecognition` (since 14.1); it needs Siri or Dictation turned on.

## At a glance

| | |
|---|---|
| Browsers | Chrome; Edge (mirrors Chrome, unverified); Safari via `webkitSpeechRecognition`. Firefox: Nightly preview only |
| Where audio goes | The browser vendor's web service; the page cannot choose or restrict the provider |
| First-use cost | None |
| Latency | Not measured; partial results with `interimResults = true` |
| Cost per command | None to the page; no API key |

## Why chosen / why not

Not chosen: the audio goes to Google's service, and the page can neither choose the provider nor ask for zero data retention. Flow Tower sends audio only when the user has set an OpenRouter key, and only to zero-data-retention endpoints.
And Firefox, the user's browser, does not have it in release.

## Sources

Checked 2026-10-10.

- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
- https://bugs.webkit.org/show_bug.cgi?id=225298 (Safari needs Siri/Dictation)
- https://webaudio.github.io/web-speech-api/
