---
id: portal-licence-char
category: vision
check: json
images: fixtures/portal-licence-char.png
steps: 1
---
# Catch a one-character licence mismatch

From real work: the browser-worker example's pre-submit verifier (`examples/browser-worker/prompts/verifier.md`), its sample request (`samples/work-item.json`) and field map (`config/field-map.yaml`, `add_driver`). The screenshot is a local rendering of that portal screen with one planted defect: one character of the licence number differs (`1` for `I`), as an OCR or typing slip would.

## Prompt

You check a filled insurance-portal form before it is submitted, from the attached full-page screenshot.

Request (add a named driver to policy MTR-0048813-02, effective 2026-10-15):
first_name Maren; last_name Albrecht; date_of_birth 1994-03-27; licence_number B072RRE2I55; relationship spouse. Document required: driving_licence_scan, uploaded with a green tick.

Compare every field on the screenshot with the request after format conversion (dates are shown DD/MM/YYYY). Also check for any red validation message, warning banner or referral notice, and that the document has its green tick.

Reply with JSON only: `{"verdict": "pass" | "fail", "mismatched": [<names of fields whose value differs, from: first_name, last_name, date_of_birth, licence_number, relationship>], "page_warning": true | false}`. `verdict` is pass only when nothing is mismatched and there is no warning.

## Expected

```json
{"verdict":"fail","mismatched":["licence_number"],"page_warning":false}
```
