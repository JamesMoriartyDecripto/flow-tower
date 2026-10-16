---
id: portal-referral-banner
category: vision
check: json
images: fixtures/portal-referral-banner.png
steps: 1
---
# Spot a referral banner on a correct form

From real work: the browser-worker example's pre-submit verifier (`examples/browser-worker/prompts/verifier.md`, "flag any red validation message, warning banner or referral notice"). Every field is right; the page carries an underwriting referral notice.

## Prompt

You check a filled insurance-portal form before it is submitted, from the attached full-page screenshot.

Request (add a named driver to policy MTR-0048813-02, effective 2026-10-15):
first_name Maren; last_name Albrecht; date_of_birth 1994-03-27; licence_number B072RRE2I55; relationship spouse. Document required: driving_licence_scan, uploaded with a green tick.

Compare every field on the screenshot with the request after format conversion (dates are shown DD/MM/YYYY). Also check for any red validation message, warning banner or referral notice, and that the document has its green tick.

Reply with JSON only: `{"verdict": "pass" | "fail", "mismatched": [<names of fields whose value differs, from: first_name, last_name, date_of_birth, licence_number, relationship>], "page_warning": true | false}`. `verdict` is pass only when nothing is mismatched and there is no warning.

## Expected

```json
{"verdict":"fail","mismatched":[],"page_warning":true}
```
