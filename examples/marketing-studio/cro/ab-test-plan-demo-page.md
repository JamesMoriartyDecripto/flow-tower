# A/B test plan: short demo form (exp-demo-form-short)

| Field | Value |
|---|---|
| Owner | Growth PM (human) — drafted by the Content writer + Measurement analyst |
| Tool | GrowthBook (feature flag `demo-form-variant`, experiment `exp-demo-form-short`) |
| Pages | /demo, /de/demo, /nl/demo, /fr/demo |
| Split | 50 / 50, sticky by anonymous id; only visitors with analytics consent are analysed |
| Start | 2026-10-06 |
| Planned end | 2026-11-03 (4 full weeks, never stopped mid-week) |

## Hypothesis
Removing three fields (phone, job title, invoice volume) from the demo form increases demo
submissions from Fit A/B companies, because form length is the top objection in session
recordings (31 % of form abandons happen at the phone field), **without** lowering MQL rate,
because enrichment recovers company size and the scorer infers volume from company size.

## Variants
- **Control (v1-long-form):** 7 fields.
- **Treatment (v2-short-form):** 4 fields (work email, first name, company, country);
  the SDR asks invoice volume in the first call.

## Metrics
- **Primary:** demo submissions per visitor (Fit A/B only).
- **Guardrails:** MQL rate of submissions (must not drop more than 5 points), SQL rate after
  21 days (read-out later), page load (LCP p75 < 2.5 s).
- **Secondary:** SDR connect rate (phone missing).

## Sample size (illustrative)
Baseline 4.1 %, minimum detectable effect +15 % relative, alpha 0.05, power 0.8:
about 17,600 visitors per arm. Current traffic ~5,200/week per arm -> ~3.5 weeks. CUPED on
pre-period sessions enabled.

## Decision rule
Ship v2 if the primary metric improves with p < 0.05 and no guardrail is breached.
If the primary is flat, keep v1 (more data for the SDR). Pre-registered; no peeking-based stops.

## Risks
- Consent bias: only consented visitors are measured; check the consent rate is equal in both arms.
- Lead quality lag: SQL guardrail is read 21 days after the end.
