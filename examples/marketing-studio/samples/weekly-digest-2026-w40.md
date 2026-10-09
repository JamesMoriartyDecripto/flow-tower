# Weekly marketing digest — 2026-W40 (Sep 28 - Oct 4)

*Written by the Measurement analyst (claude-opus-5-5) on 2026-10-05 07:00. Every table cites
its mart query. Fictional company; all numbers illustrative.*

## Headline
Qualified pipeline **312 k EUR** (+9 % vs 4-week avg), blended CAC **4,180 EUR** (target <= 4,500),
media spend **27.6 k EUR** (on plan, 0.98x). LinkedIn drove the increase in SQLs; Meta
retargeting looks strong in-platform but its lift test says to discount it (see below).

## Channels (`q_channel_week_v3`)
| Channel | Spend EUR | Pacing | Platform conv. | MQL | SQL | Pipeline EUR | Cost / MQL | Trend |
|---|---|---|---|---|---|---|---|---|
| Google non-brand | 9,940 | 0.97 | 41 | 28 | 10 | 118 k | 355 | = |
| Google brand | 610 | 1.00 | 22 | 15 | 6 | 64 k | 41 | = |
| LinkedIn | 8,880 | 1.05 | 33 lead forms | 19 | 8 | 97 k | 467 | up |
| Meta | 5,520 | 0.99 | 37 | 9 | 2 | 21 k | 613 | down |
| TikTok (test) | 1,820 | 1.00 | 0 | 0 | 0 | 0 | n/a | week 2 of 8 |
| Organic search | 0 | n/a | n/a | 24 | 6 | 12 k | n/a | up |

**Three lenses on Meta:** platform-reported 37 conversions; GA4 data-driven credits 14; the
August conversion-lift test measured incremental results at about 0.6x of attributed. We
steer Meta on lift-adjusted numbers.

## Funnel (`q_funnel_week_v2`)
Sessions 18,400 -> demo/trial 612 (3.3 %) -> MQL 95 (15.5 %) -> SQL 32 (34 %).
Lead response p90: **42 min** (SLA 60). Two leads breached SLA on Friday after 17:00.

## Lifecycle
Gmail spam rate 0.04 % (Postmaster, 7-day), hard bounces 0.3 %, trial-to-paid 11.8 %
(target 12 %). Trial onboarding v3 activation 7d: 46 % (v2: 41 %).

## Experiments
| Test | Day | Sample vs needed | Read |
|---|---|---|---|
| exp-demo-form-short (GrowthBook) | 0 | starts Oct 6 | n/a |
| LinkedIn geo holdout (GeoX) | design | 4 of 16 Länder dark from Oct 13 | n/a |

## Data quality
Consent rate (analytics_storage granted, EEA): 61 % (prev. 60 %). No tracking breaks.
Ledger vs platform UI difference: 0.4 %.

## Proposal
**Within channel (auto-eligible, under 500 EUR/day):**
1. Google non-brand: +60 EUR/day to FR (lost impression share to budget 31 %, CPA 312).
2. LinkedIn: -80 EUR/day on C1 (frequency 4.1, CPL rising); creative refresh requested.

**Cross-channel (needs CMO + Finance, > 5,000 EUR/month):**
3. Move 6,000 EUR/month from Meta prospecting (m-cfo-lookalike) to LinkedIn C2 for November.
   Evidence: MMM marginal ROI LinkedIn 1.9 vs Meta 0.7 at current spend; Meta lift-adjusted
   cost per SQL 2.4x LinkedIn. Risk: LinkedIn CPM inflation in November; re-check Nov 15.

**Not proposed:** any change to TikTok before week 8 (kill criterion stands).
