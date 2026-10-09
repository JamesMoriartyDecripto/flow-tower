# Email consent and deliverability rules

Applies to every journey and one-off send from Customer.io (EU) and HubSpot.

## Consent (GDPR / ePrivacy, plus CAN-SPAM for US recipients)
- Marketing email only with recorded consent (`marketing_consent = true`, source, timestamp,
  wording version). DE sign-ups use double opt-in. Checkboxes are never pre-ticked.
- Transactional / account emails (trial setup, security) need no marketing consent and carry
  no promotion.
- Every marketing email: accurate From / Reply-To, non-misleading subject, postal address,
  visible unsubscribe link, preference centre. One "unsubscribe from all marketing" option.
- Opt-outs processed within 2 days (internal SLA). CAN-SPAM's legal maximum is 10 business
  days and the mechanism must work for at least 30 days after sending.
- Using a vendor does not move liability: we remain responsible for what Customer.io sends.

## Authentication (Gmail / Yahoo bulk-sender rules; we send > 5,000/day)
- SPF and DKIM on `mail.tallymoor.example`; DMARC published (currently `p=quarantine`),
  From domain aligned with DKIM.
- One-click unsubscribe: `List-Unsubscribe` (https URL) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on all marketing and subscribed messages.
- TLS for transmission; valid forward and reverse DNS for sending IPs (handled by Customer.io).

## Thresholds (Google Postmaster Tools, daily)
| Metric | Target | Action at breach |
|---|---|---|
| User-reported spam rate | < 0.10 % | Review last 7 days of sends, tighten segment |
| User-reported spam rate | never >= 0.30 % | Stop all marketing sends; lifecycle owner + Head of Growth |
| Hard bounce rate per send | < 1 % | Pause that segment, re-verify list source |
| Unsubscribe rate per send | < 0.3 % | Review frequency and relevance |

## Warm-up
New sending domains or IPs: start with the most engaged 2,000 contacts, double daily volume
only while spam rate stays under 0.1 %.

## Seed tests
Monthly inbox-placement seed test across Gmail, Outlook, GMX, web.de, Orange; target >= 95 %.
