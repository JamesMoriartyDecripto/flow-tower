# Legitimate interest assessment: B2B prospect research and outreach

Controller: Ferrovento S.r.l. (fictional), Bologna. Prepared by: Head of Sales with the DPO.
Date: 2026-10-06. Review: every 12 months or when a source or channel changes. Structure follows
the three steps in EDPB Guidelines 1/2024 on Art. 6(1)(f) GDPR (version 1.0, consultation
closed November 2024).

> **Scope limit.** This LIA covers *processing* of business-contact data for account research,
> scoring and the channels marked allowed in `channel-rules.yaml`. It does **not** make cold
> promotional email lawful in Italy: there, art. 130 of the Codice privacy (ePrivacy) requires
> prior consent, and the Garante holds that recital 47 GDPR cannot be invoked to replace it
> (decision 17 May 2023, doc. web 9899880).

## 1. Purpose and legitimate interest

- Find manufacturing companies that match the ICP and contact the people whose role relates to
  the service (controller, plant manager, CFO, IT manager).
- Interest: offering B2B services to businesses. Lawful, specific, real and present.

## 2. Necessity

| Data | Needed? | Why / alternative considered |
|---|---|---|
| Company registry data (Atoka) | Yes | Fit and size; mostly not personal data |
| Name + role of 1-3 people per account | Yes | Message must reach the right role (FR rule) |
| Work email (FR), business phone (IT) | Yes, per channel | Only the channel the country rules allow |
| Personal email, mobile, social profiles, photos | **No** | Not collected; personal domains are dropped |
| Inferred traits (age, nationality, gender) | **No** | Prohibited in the scorer prompt |

Minimisation: enrichment runs only after the basis check and only for tier A/B accounts.

## 3. Balancing

- **Reasonable expectations:** professionals in a buying role expect occasional, relevant vendor
  contact at work, not repeated contact. Cap: 4 emails or 2 calls per prospect, then stop.
- **Impact:** low (business context), but loss of control if data is reused. Mitigations below.
- **Safeguards:**
  - Information notice at first contact (who we are, source of the data, rights, opt-out).
  - Opt-out link in every email, List-Unsubscribe header, processed within 24h in all tools.
  - Suppression list checked before every batch; objection to processing ends all processing
    except the minimal record needed to avoid re-contact.
  - No engagement after 180 days: contact deleted from Instantly and HubSpot (company kept).
  - Human sender: every email goes out under a named employee who can answer.
  - Personalization only from cited, verifiable sources (`scripts/verify_personalization.py`).

## Outcome

Legitimate interest **accepted** for account research, scoring, phone calls to RPO-checked
business numbers (IT) and role-relevant email (FR). **Rejected** for cold email in Italy:
consent or an existing customer relationship (art. 130(4)) is required.

Signed: Head of Sales, DPO (fictional names withheld in this example).
