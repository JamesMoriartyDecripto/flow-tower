# Measurement plan — Tallymoor marketing (v4, 2026-10)

## Principles
1. **Consent first.** EEA/UK/CH visitors default to denied for all four Consent Mode v2 types
   until they choose. No tag fires on a denied type except cookieless pings (advanced mode,
   approved by DPO 2026-03).
2. **One mart, one number.** Every reported figure comes from BigQuery `marketing_mart`.
3. **Three lenses, never summed.** Platform-reported, attribution, MMM + experiments answer
   different questions. Attribution steers the week; MMM shapes the budget; experiments are
   ground truth and calibrate the MMM.

## Collection
| Layer | What | Notes |
|---|---|---|
| CMP + Consent Mode v2 | `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization` | defaults in `measurement/consent-defaults.js` |
| Google tag -> sGTM | first-party `collect.tallymoor.example` | sGTM drops IP, user agent detail and free-text fields |
| sGTM -> GA4 | events + consent state | GA4 data retention 14 months; daily BigQuery export |
| sGTM -> Google Ads | conversions, enhanced conversions only with `ad_user_data` granted | |
| sGTM -> Meta CAPI | Lead, CompleteRegistration with shared `event_id` | browser pixel only after consent; dedup within 48 h |
| HubSpot -> mart | lifecycle stages, deals, amounts | hourly sync |
| Offline conversions | MQL, SQL, closed-won -> Google (enhanced conversions for leads: hashed email + GCLID), Meta CAPI | hourly job, `conversion.offline` |

## Key events
`demo_requested`, `trial_started`, `invoice_posted` (activation), `mql`, `sql`, `closed_won`.
Primary optimisation event per platform: SQL where volume allows (> 30/month per campaign),
otherwise MQL.

## Attribution (in-week steering)
- GA4 data-driven attribution for web conversions.
- HubSpot first-touch and last-touch for pipeline, shown side by side.
- Known biases: over-credits retargeting and brand search; under-credits LinkedIn
  (view-through, long cycles) and anything without a click.

## MMM (budget shape)
- Google Meridian, weekly data, 104 weeks, channels: Google search brand/non-brand, LinkedIn,
  Meta, TikTok (from Q4), organic search (control), email (control), seasonality, price change.
- KPI: qualified pipeline EUR. Refreshed monthly (3rd, 05:00).
- ROI priors calibrated with the lift-test results below; channels with high uncertainty are
  prioritised for the next test using Meridian's channel calibration recommendation.
- Output: response curves + marginal ROI per channel -> `planning.allocator`.

## Incrementality tests
| Channel | Design | Window | Status |
|---|---|---|---|
| LinkedIn | Geo holdout, 4 of 16 German Länder dark (Meridian GeoX) | 2026-10-13 to 11-23 | scheduled |
| Meta retargeting | Meta conversion lift (randomised holdout 10 %) | 2026-08-04 to 09-14 | done: iROAS 0.6 of attributed |
| Google non-brand | Geo heavy-up NL | 2026-Q1 | proposed |

Rule: one test per channel per half-year; never two overlapping tests in the same geo.

## Data quality checks (daily)
- Conversions to zero on any platform for > 6 h -> tracking alert, optimizer frozen.
- Consent rate shift > 10 points week over week -> flag in the digest.
- Spend ledger vs platform UI difference > 2 % -> reconcile.

## Privacy
- Region: all storage in EU (europe-west3). DPA with every vendor; sub-processor list public.
- Hashing: SHA-256 of normalised email/phone before leaving our systems.
- Retention: sGTM request logs 14 d, mart 3 years (aggregated after 25 months).
