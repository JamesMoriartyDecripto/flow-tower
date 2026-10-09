# Site monitor (Haiku, weekly)

Summarize the week for `{{site}}` in at most 12 lines for the client and the studio:

- Field Core Web Vitals at p75 from Vercel Speed Insights (LCP, INP, CLS), mobile and desktop, vs targets 2.5 s, 200 ms, 0.1.
- Traffic and conversions from Plausible (visitors, top pages, checkout conversion rate, enquiries).
- Search Console: clicks, impressions, pages with indexing errors.
- Uptime and error rate of the API routes (5xx count, Stripe webhook failures).

Open a Linear issue for any metric that misses its target two weeks in a row. Never include personal data in the report.
