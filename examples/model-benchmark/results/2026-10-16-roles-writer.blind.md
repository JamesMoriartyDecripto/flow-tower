# Blind rubric sheet

Score each answer 0-10 against its task rubric and rubric.md. You do not know which model wrote it; do not try to guess.

## B001 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
That's a long wait with no answers, Joost, and we're sorry for the silence on our side. We've found what's holding up your Kargo, and one of our support team will send you a DM today with the full update, so please keep an eye on your inbox.
````

## B002 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook** (first 2 seconds)
Cold weather takes range off your cargo bike. Here's how much, and what to do about it.

**Body**
Cold slows the chemistry inside a lithium battery, so it gives you less range. In our test rig report TR-2026-09 (545 Wh battery, 100 kg load, assist level 2), the bike covered 62 km at 20 °C and 48 km at 0 °C. That is 14 km less, about 23% of the warm-weather range. Your results will vary with load, terrain, tyre pressure and how hard you pedal.

What helps:
- **Store indoors.** Keep the battery in a room you'd be comfortable in, not in an unheated shed or garage overnight.
- **Charge at room temperature.** Bring the battery inside and let it warm up before you plug it in. Charging a cold battery is harder on it.
- **Plan for the lower number.** If your route is 40 km in winter, plan around the cold-test figure, not the summer one.

**CTA** (one action)
Save this and check your route length against the cold-weather figure before your next winter ride.

**Video script** (max 30 s)

| Shot | Visual | On-screen text |
|---|---|---|
| 1 (0–3 s) | Frosty street, cargo bike at the kerb, breath visible | Cold cuts range. Here's by how much. |
| 2 (3–9 s) | Close-up of the battery on a bench, indoors | Store it indoors. |
| 3 (9–15 s) | Battery being carried inside from the cold, then plugged in | Let it warm to room temperature before charging. |
| 4 (15–23 s) | Simple bar graphic: 62 km bar and 48 km bar | 62 km at 20 °C vs 48 km at 0 °C. Source: TR-2026-09 (545 Wh, 100 kg load, assist level 2). |
| 5 (23–30 s) | Rider checking route on phone, bike ready | Plan winter routes around the cold number. Save this. |

**Alt text** (cover image)
Halden electric cargo bike parked on a frosty Amsterdam street with a battery-charging reminder overlaid.
````

## B003 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Hi Joost, sorry about the wait and the silence on your emails, that's not the experience we want you to have. We'll send you a DM today so our support team can look into your order and follow up with you directly.
````

## B004 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: Approve supplier invoices faster, with fewer errors
meta_description: Cut invoice approval delays and manual rework. See how Tallymoor helps finance controllers approve supplier invoices on time.
slug: approve-supplier-invoices-faster
---

## Get supplier invoices approved before month-end closes

As a finance controller, your job is to approve every supplier invoice on time, match it to the right purchase order, and keep errors out of the ledger. When invoices wait in inboxes for a week, late-payment fees build up and month-end gets crowded.

Picture a 40-person AP team handling 6,000 invoices a month. Most of the delay isn't the approval decision itself. It's the chase: finding the right PDF, re-keying line items, and waiting for the approver to open an email.

Tallymoor reads supplier invoices so your team doesn't have to retype them. It reads header and line-item fields from supplier PDFs with 97 % field accuracy, measured on header and line-item fields; accuracy varies by supplier layout. <!-- claim: C-001 -->

Approvals move faster as well. Across a customer cohort, median approval time fell from 9 days to 3 days; individual results vary. <!-- claim: C-002 -->

Structured e-invoices don't need manual handling either. Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 -->

Your data stays in Europe. Customer data is hosted in the EU only. <!-- claim: C-008 -->

The investment is recovered quickly. Typical payback is under 9 months. <!-- claim: C-005 --> [CLAIM NEEDED: link to the ROI method page, required by C-005]
````

## B005 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Hi Joost, that's not the experience we want you to have, and we're sorry about the silence on your emails. We'll send you a DM today so our support team can look into your order and follow up with you directly.
````

## B006 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: Faster invoice approvals for finance controllers
meta_description: Approve supplier invoices with less chasing and fewer manual checks. See how Tallymoor reads, routes and tracks invoices for European finance teams.
slug: faster-supplier-invoice-approval
---

## Approve supplier invoices without chasing them

You are the last check before money leaves the company. Every invoice that reaches you has to be right: the right supplier, the right amounts, the right budget owner. Yet most of your day goes to the work around that decision. You ask who ordered the goods, find out why a line item doesn't match the purchase order, and remind approvers who have not responded.

Picture an AP team handling 6,000 invoices a month. If even a small share arrives as PDFs that someone has to retype, errors come in at the start, and you pay for them at the end, in queries, delays and late-payment conversations with suppliers.

## Where Tallymoor fits

Tallymoor takes the preparation off your desk, so you review only what needs a decision.

- **Data capture:** It reads header and line items from supplier PDFs with 97 % field accuracy, so fewer fields need correcting. <!-- claim: C-001 --> Accuracy is measured on header and line-item fields and varies by supplier layout.
- **E-invoice formats:** It receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, so structured invoices from your suppliers arrive in the same queue as PDFs. <!-- claim: C-004 -->
- **Approval speed:** Customers cut median approval time from 9 days to 3 days. <!-- claim: C-002 --> This is a median across a customer cohort, and individual results vary.
- **Data location:** Customer data is hosted in the EU only. <!-- claim: C-008 -->

## What this means for your week

Fewer corrections upstream mean fewer exceptions on your desk. Approvers get invoices that are already structured, so they spend less time asking what an invoice is for and more time deciding on it. You keep the control you need, with less manual chasing.

## The business case

Most teams want to know how long it takes to recover the investment. Typical payback is under 9 months. <!-- claim: C-005 --> [CLAIM NEEDED: link to the ROI method page, required by C-005's qualifier]

**See it with your own invoices.** Send us a sample of your hardest supplier layouts and we will show you what Tallymoor reads and what it routes to approval.
````

## B007 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold morning? Your battery feels it too.

**Body**
- Store your battery indoors overnight. A cold battery gives less.
- Charge it at room temperature, not straight off a freezing ride.
- Expect shorter range in the cold. In our test (Halden test rig report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C.
- That's 14 km less. Plan your trips with that in mind.

**CTA**
Bring your battery inside tonight.

**Video script** (about 28 s)
1. 0-2 s: Close shot of a breath cloud next to a bike on a frosty street. Text: "Cold morning? Your battery feels it too."
2. 2-8 s: Hands lift the battery off the bike. Text: "1. Store it indoors overnight."
3. 8-14 s: Battery plugged in on a hallway shelf. Text: "2. Charge at room temperature."
4. 14-24 s: Simple two-bar graphic. Text: "62 km at 20 °C. 48 km at 0 °C." Small text: "Halden test rig TR-2026-09: 545 Wh, 100 kg load, assist level 2."
5. 24-28 s: Rider setting off, scarf on. Text: "Expect shorter range. Plan for it."
6. 28-30 s: Halden logo. Text: "Bring your battery inside tonight."

**Alt text**
Hands lifting an electric battery off a Halden cargo bike on a frosty Amsterdam street.
````

## B008 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, Without Re-Keying"
meta_description: "See how finance controllers shorten supplier invoice approvals with accurate PDF extraction, e-invoice formats and EU-only data hosting."
slug: approve-supplier-invoices-faster
---

## Clear supplier invoices without chasing missing details

As a finance controller, your job is to get every supplier invoice approved on time and correctly. Picture a 40-person AP team handling 6,000 invoices a month. Each one needs its supplier, PO reference, tax lines and line items checked before payment can be released. When staff re-key that data by hand, errors slip through, approvals sit in inboxes, and suppliers start asking why they have not been paid.

Tallymoor takes over the data entry so your reviewers can focus on decisions. It reads header and line-item fields from supplier PDFs with 97 % field accuracy, measured on header and line-item fields; accuracy varies by supplier layout. <!-- claim: C-001 -->

Speed matters as much as accuracy. Across one customer cohort, the median approval time fell from 9 days to 3 days; individual results vary. <!-- claim: C-002 --> Most customers see the investment return within a short window: the typical payback is under 9 months. <!-- claim: C-005 --> [CLAIM NEEDED: link to ROI method page, required for C-005 qualifier]

Your invoices also arrive in different formats. Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, so structured e-invoices and PDFs flow into the same approval queue. <!-- claim: C-004 -->

Finally, your supplier and financial data stays within Europe. Customer data is hosted in the EU only. <!-- claim: C-008 -->
````

## B009 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold morning? Your battery feels it too.

**Body**
- Store the battery indoors overnight. A cold battery gives less range.
- Charge it at room temperature. Bring it in first and let it warm up before you plug it in.
- Expect less range in the cold. In our test (Halden test rig report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C.
- That's 14 km less, so plan your trip with room to spare.

**CTA**
Before your next cold ride, take your battery inside tonight.

**Video script** (30 s max)
1. 0–3 s: Close-up of a bike parked outside in frost, with the battery on it. On-screen text: "Cold morning? Your battery feels it too."
2. 3–10 s: Hand lifts the battery off the bike and carries it through the front door. On-screen text: "1. Store it indoors."
3. 10–17 s: Battery on a hallway shelf, charger plugged in. On-screen text: "2. Charge at room temperature. Let it warm up first."
4. 17–26 s: Simple two-bar graphic. On-screen text: "62 km at 20 °C. 48 km at 0 °C." Small caption: "Halden test TR-2026-09: 545 Wh, 100 kg load, assist level 2."
5. 26–30 s: Rider checks the battery in the hallway. On-screen text: "Take it inside tonight." Halden logo.

**Alt text**
A hand lifting an electric cargo bike battery off a frosty bike outside an Amsterdam front door.
````

## B010 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: Faster Supplier Invoice Approval for Controllers
meta_description: Cut invoice approval delays without losing control. See how Tallymoor reads supplier invoices, routes them for approval and keeps data in the EU.
slug: supplier-invoice-approval-for-finance-controllers
---

## You sign off on every invoice. The queue should not decide when.

Picture an AP team processing 6,000 invoices a month. Each one arrives in a different shape: a PDF with a custom layout, an XML file, a scan forwarded by a buyer. Before you can approve anything, someone has to key in the header, check the line items and chase the right budget owner. By the time an invoice reaches you, the early-payment discount may be gone and the month-end accruals are already a guess.

Your job is to approve with confidence, and confidence needs clean data and a clear trail. That is hard to get when most of the effort goes into retyping.

### What changes with Tallymoor

Tallymoor captures the invoice data before it reaches your desk, so you review exceptions instead of re-reading documents.

- **Accurate capture.** It reads header and line items from supplier PDFs with 97 % field accuracy, measured on header and line-item fields and varying by supplier layout. <!-- claim: C-001 -->
- **Structured formats, too.** It receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, so e-invoices from your suppliers arrive in the same workflow. <!-- claim: C-004 -->
- **Faster approvals.** Customers cut median approval time from 9 days to 3 days. This is a median across a customer cohort, and individual results vary. <!-- claim: C-002 -->
- **Data stays in the EU.** Customer data is hosted in the EU only. <!-- claim: C-008 -->

### What it means for the business case

Faster approvals help you capture discounts, close sooner and forecast cash with fewer surprises. Typical payback is under 9 months. <!-- claim: C-005 --> See how we calculate it on the [ROI method page](/roi-method).

### See it on your own invoices

Send us a sample of your real supplier invoices, including the awkward layouts. We will show you what Tallymoor captures and where your approvers would still need to step in.

[Book a walkthrough](/demo)
````

## B011 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Sorry for the wait, Joost, and for the emails going unanswered. We're sending you a direct message now so our support team can look into your order and get back to you there.
````

## B012 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook** (first 2 seconds)
Cold weather can cut your range by about a quarter. Here's how to keep more of it.

**Body**
Our test rig (report TR-2026-09) ran a 545 Wh battery with a 100 kg load at assist level 2. It went 62 km at 20 °C and 48 km at 0 °C. That's 14 km less, or about 23% less range, in the cold. Plan your route with that in mind.

Two habits help most. Store the battery indoors, not in an unheated shed or garage. Charge it indoors at room temperature, and let it warm up after a cold ride before you plug it in.

**CTA** (one action)
Save this video and check your battery before the next cold morning.

**Video script** (max 30 s)

| Shot | Visual | On-screen text | Voiceover / sound |
|---|---|---|---|
| 1 (0–3 s) | Bike parked outside, frost on the pavement | "Cold can cut your range by about 23%." | "Cold weather takes range off your battery." |
| 2 (3–8 s) | Battery being carried indoors | "Store it indoors." | "Bring the battery inside overnight." |
| 3 (8–14 s) | Battery on a table next to a radiator-free wall, plug going into wall socket | "Charge at room temperature." | "Charge it indoors, at room temperature, once it has warmed up." |
| 4 (14–22 s) | Rider checking the display on a cold morning | "Test rig, 20 °C: 62 km. 0 °C: 48 km." | "In our test rig, the same ride went 62 km at 20 °C and 48 km at 0 °C." |
| 5 (22–27 s) | Rider planning route on phone | "Plan for about 14 km less in the cold." | "Plan your route with that in mind." |
| 6 (27–30 s) | Halden logo | "Source: Halden test rig report TR-2026-09" | "Save this before the next cold morning." |

**Alt text** (cover image)
Electric cargo bike parked outside on a frosty morning, with a battery being carried indoors and the text "Cold cuts range: store indoors, charge at room temperature."
````

## B013 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Faster supplier invoice approval for finance controllers"
meta_description: "Approve supplier invoices with less chasing and fewer manual checks. See how Tallymoor reads, matches and routes invoices for European finance teams."
slug: supplier-invoice-approval-finance-controllers
---

## Approve invoices without chasing the paperwork

You are the last signature before money leaves the account. Before you sign, you need to know the invoice is real, the amounts are right and the right person has agreed to it. In practice that means chasing missing purchase order references, re-keying line items and asking budget owners for a reply that arrives on day six.

Picture a 40-person AP team handling 6,000 invoices a month. Most of the delay is not your decision. It is the time an invoice spends waiting for someone to type, find or confirm something.

### Where Tallymoor fits

Tallymoor takes over the preparation work so your review starts with clean data. It reads header and line items from supplier PDFs with 97% field accuracy. <!-- claim: C-001 --> That figure is measured on header and line-item fields and varies by supplier layout, so unusual formats may still need a quick check.

Not every invoice arrives as a PDF. Tallymoor also receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, <!-- claim: C-004 --> so structured and scanned documents land in the same approval queue.

### What changes for you

- You see invoices that are already read, so you spend your time on exceptions rather than data entry.
- Approvers get requests in one place, which cuts the back-and-forth.
- Customers cut median approval time from 9 days to 3 days. <!-- claim: C-002 --> This is a median across a customer cohort, and individual results vary.

### Data stays in the EU

Customer data is hosted in the EU only, <!-- claim: C-008 --> which simplifies the conversation with your data protection officer.

### The business case

Typical payback is under 9 months. <!-- claim: C-005 --> See how we calculate it on the [ROI method page](/roi-method).

[Book a walkthrough with your own invoices](/demo)
````

## B014 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook** (first 2 seconds)
Cold snap coming? Your cargo bike loses range. Here's how to limit it.

**Body**
Cold slows battery chemistry, so you get less range from the same charge. In our test rig report TR-2026-09 (545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C. That's 14 km less, about 23%.

Three habits help:
- Store the battery indoors when you can, not in an unheated shed or car overnight.
- Charge it at room temperature. Bring it inside and let it warm up before you plug it in.
- Plan your route on the lower figure when it's freezing.

Your results will vary with load, terrain, and assist level. The figures above are from one test with those settings.

**CTA** (one action)
Save this video and check your route range before your next cold ride.

**Video script** (max 30 s)

| Shot | Visual | On-screen text | Audio/VO |
|---|---|---|---|
| 1 (0–2 s) | Frosty street, cargo bike at curb | "Cold snap? Your range drops." | Cold snap coming? Your cargo bike loses range. |
| 2 (2–7 s) | Battery being carried from a shed into a hallway | "Store it indoors." | Store the battery indoors, not in an unheated shed. |
| 3 (7–13 s) | Battery sitting on a shelf, thermometer in frame reading room temperature | "Charge at room temperature." | Bring it inside and let it warm up before you charge. |
| 4 (13–21 s) | Graphic: two bars, 62 km and 48 km | "20 °C: 62 km / 0 °C: 48 km" | In our test rig report, TR-2026-09, range was 62 km at 20 °C and 48 km at 0 °C. That's about 23% less. |
| 5 (21–25 s) | Rider checking route on phone | "Plan on the lower number." | Plan your route on the lower figure when it's freezing. |
| 6 (25–30 s) | Bike at door, end card | "Save this for your next cold ride." | Save this for your next cold ride. Link in bio for the full test report. |

Test conditions: 545 Wh battery, 100 kg load, assist level 2 (TR-2026-09). Results will vary.

**Alt text** (cover image)
Halden cargo bike parked on a frosty Amsterdam street with a battery-care tip overlay reading "Cold snap? Store it indoors."
````

## B015 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold mornings shorten your range. Here's what to expect, and what helps.

**Body**
Cold slows the chemistry inside your battery, so you get fewer kilometres per charge. In our test rig (Halden report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range dropped from 62 km at 20 °C to 48 km at 0 °C. That's about 23% less.

Three habits help:
1. Store the battery indoors overnight, not in the shed or on the bike.
2. Charge it at room temperature. If it's been outside, let it warm up first.
3. Click it in just before you ride, so it starts the trip warm.

Your bike can stay outside. Your battery would rather come in with you.

**CTA**
Save this video for the first frosty morning.

**Video script** (approx. 28 s, captions on throughout)

| Time | Shot | On-screen text |
|---|---|---|
| 0–2 s | Close-up of breath fogging over a frosty cargo bike outside an Amsterdam house | Cold = less range. What to expect. |
| 2–7 s | Hand slides the battery out of the frame | In the cold, batteries give fewer km per charge |
| 7–13 s | Simple graphic of two bars: 62 km at 20 °C and 48 km at 0 °C | 62 km at 20 °C → 48 km at 0 °C (about 23% less) |
| 13–15 s | Small text held under the graphic | Halden test TR-2026-09: 545 Wh, 100 kg load, assist level 2 |
| 15–19 s | Battery carried through the front door and set on a hallway shelf | 1. Store it indoors |
| 19–23 s | Battery on a charger in a warm kitchen. A kettle sits in the background. | 2. Charge at room temperature |
| 23–26 s | Battery clicked into the bike and the rider sets off with a kid in the box | 3. Click it in just before you ride |
| 26–28 s | Bike rolls away down a frosty street | Save this for the first frosty morning |

**Alt text**
A Halden electric cargo bike parked on a frosty Amsterdam street while someone carries its battery indoors.
````

## B016 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
I'm sorry about the wait, Joost, and that our emails didn't reach you. We're sending you a direct message now with the next steps on your order, and our support team will follow up there.
````

## B017 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Waiting past the promised date with no reply to your emails isn't okay, sorry about that, Joost. We've just sent you a DM so our support team can look into your order and get back to you there with a proper update.
````

## B018 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Supplier Invoice Approval for Finance Controllers"
meta_description: "Approve supplier invoices faster, with line items captured, e-invoice formats received and data hosted in the EU. Built for European finance controllers."
slug: "supplier-invoice-approval-finance-controllers"
---

## You sign off on the invoice. You should not have to retype it.

Your job is to approve what the business owes, on time and with the evidence in order. In practice, much of your week goes to chasing approvers, checking line items against purchase orders and answering suppliers who want to know where their payment is. Picture a 40-person AP team handling 6,000 invoices a month. Every invoice that sits in someone's inbox is a late-payment risk and a gap in your audit trail.

Tallymoor takes the retyping and the chasing off your desk.

**Line items, not only totals.** Tallymoor reads header and line-item fields from supplier PDFs with 97 % field accuracy. Accuracy is measured on header and line-item fields and varies by supplier layout. <!-- claim: C-001 --> You review exceptions instead of keying in every row.

**Structured e-invoices, received as they arrive.** Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 --> Your team works from a single queue, whatever format each supplier sends.

**Approvals that move.** Customers cut median approval time from 9 days to 3 days. This is the median across the customer cohort, and individual results vary. <!-- claim: C-002 --> Routing rules send each invoice to the right approver, and reminders follow up so you don't have to.

**Data that stays in the EU.** Customer data is hosted in the EU only. <!-- claim: C-008 -->

**A business case you can defend.** Typical payback is under 9 months. See [how we calculate ROI]([LINK NEEDED: ROI method page URL]). <!-- claim: C-005 -->

[Book a walkthrough with your own invoices]
````

## B019 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold mornings shorten your range. Here's what we measured, and what you can do about it.

**Body**
Lithium batteries don't like the cold. Three habits help:
1. Store the battery indoors. A hallway works; a frosty shed doesn't.
2. Charge it at room temperature. If it's been outside, give it an hour indoors first.
3. Plan for less range. In our test (Halden test rig report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C. That's 14 km less, roughly a fifth. Your route, load and assist level will change your numbers.

Put the battery back on the bike just before you ride, and winter gets a lot less dramatic.

**CTA**
Save this video for the first cold morning.

**Video script** (approx. 28 s, captions on throughout)

| Time | Shot | On-screen text |
|---|---|---|
| 0–2 s | Frosty street at dawn, cargo bike parked, breath visible | "Cold = less range. Here's how much." |
| 2–7 s | Rider unclips battery and carries it through the front door | "1. Store the battery indoors" |
| 7–13 s | Battery resting in hallway, clock graphic ticks forward one hour, then charger plugged in | "2. Charge at room temperature. Let it warm up ~1 hour first" |
| 13–21 s | Simple bar graphic: 62 km bar shrinks to 48 km, with a thermometer going from 20 °C to 0 °C | "20 °C: 62 km → 0 °C: 48 km. Source: Halden test TR-2026-09 (545 Wh, 100 kg load, assist 2)" |
| 21–25 s | Rider clicks battery onto the bike, kid climbs into the box | "3. Plan for less range. Fit the battery just before you ride" |
| 25–28 s | Bike rides off down a cold canal-side street | "Save this for the first cold morning" |

**Alt text**
A Halden electric cargo bike parked on a frosty Amsterdam street at dawn, with a rider carrying its battery indoors.
````

## B020 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
That's not the wait you signed up for, and we're sorry nobody has answered your emails. We've flagged your order with our support team, and they'll send you a DM today with an update on where it stands. Could you keep an eye on your DMs?
````

## B021 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve supplier invoices faster, with fewer surprises"
meta_description: "Cut approval delays and manual keying. Tallymoor reads supplier invoices, supports e-invoice formats and keeps data in the EU."
slug: faster-supplier-invoice-approval
---

## You sign off what you can't fully see

As a finance controller, you approve invoices you didn't key in and often can't fully check. A PDF arrives, someone retypes the header and line items, and a mismatch surfaces only when you're about to release payment. Picture a 40-person AP team working through 6,000 invoices a month: even a small share of keying errors becomes a daily queue of questions, chasers and held payments.

The delay usually isn't the approval itself. It's the time an invoice spends waiting for clean data, the right approver and a missing purchase order reference.

## What changes with Tallymoor

Tallymoor takes over the capture work, so what reaches you is already structured and ready to review.

- **Fewer retyped fields.** Tallymoor reads header and line items from supplier PDFs with 97 % field accuracy, measured on header and line-item fields, and varying by supplier layout. <!-- claim: C-001 -->
- **E-invoices without detours.** It receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, so structured formats from your suppliers don't need a separate process. <!-- claim: C-004 -->
- **Faster decisions.** Customers cut median approval time from 9 days to 3 days (median across the customer cohort; individual results vary). <!-- claim: C-002 -->
- **Data stays in the EU.** Customer data is hosted in the EU only. <!-- claim: C-008 -->

## What it means for your budget

Teams usually ask when the investment pays back. Typical payback is under 9 months, and the assumptions behind that figure are set out on our [ROI method page](/roi-method). <!-- claim: C-005 -->

## See it on your own invoices

Send us a sample of your real supplier invoices, including the awkward layouts. We'll show you what Tallymoor extracts, what it flags for review, and how the result would reach your approvers.

[Book a walkthrough](/demo)
````

## B022 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, With Less Chasing"
meta_description: "Cut invoice approval time and manual re-keying. See how Tallymoor helps finance controllers clear supplier invoices, with EU-only data hosting."
slug: "approve-supplier-invoices-faster"
---

## Clear your approval queue without chasing every invoice

As a finance controller, your week is measured by how quickly supplier invoices move from inbox to approved. Every invoice that waits for a missing purchase order number, a re-keyed line item, or a manager's signature delays payment and invites supplier calls you would rather not take.

Consider a 40-person AP team processing 6,000 invoices a month. At that volume, even a few extra days per invoice means thousands of open items at any time. Controllers end up spending their hours checking status instead of reviewing spend.

Tallymoor reads header and line-item fields from supplier PDFs with 97 % field accuracy. That figure was measured on header and line-item fields and varies by supplier layout, so check it against your own invoices during evaluation. <!-- claim: C-001 -->

Your suppliers already send structured e-invoices, and the system needs to accept them. Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 -->

Across the customer cohort we measured, median approval time fell from 9 days to 3 days. Individual results vary. <!-- claim: C-002 -->

Your supplier and financial data stays under European control. Customer data is hosted in the EU only. <!-- claim: C-008 -->
````

## B023 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Hi Joost, sorry about the wait and the silence on your emails, that's not the experience we want you to have. We've seen your comment and our support team will contact you directly by DM today to sort out where things stand, so please keep an eye on your messages.
````

## B024 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Sorry for the wait, Joost, and for the silence on your emails. We're sorting this out directly with you: please check your direct messages, where our support team will reply with the details and next steps.
````

## B025 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold mornings shorten your range. Here's how much, and what to do about it.

**Body**
Lithium batteries don't like the cold. On our test rig (Halden report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range dropped from 62 km at 20 °C to 48 km at 0 °C. That's about 14 km, or just under a quarter.

Three habits help:
1. Store the battery indoors overnight, not in the shed.
2. Charge it at room temperature. Let a cold battery warm up first.
3. Click it in just before you ride, so it starts the trip warm.

The range comes back when the weather warms up. Winter just asks for a bit more planning.

**CTA**
Save this video for the first frosty morning.

**Video script** (approx. 28 s, captions on screen throughout)

| Time | Shot | On-screen text |
|---|---|---|
| 0–2 s | Close-up: frost on a Halden cargo bike's battery, breath visible in the air | Cold = less range. How much? |
| 2–8 s | Graphic over test rig footage: two bars, 62 km and 48 km | 62 km at 20 °C → 48 km at 0 °C. Source: Halden test TR-2026-09 (545 Wh, 100 kg load, assist 2) |
| 8–13 s | Rider unclips battery in a shed and carries it into a hallway | 1. Store the battery indoors |
| 13–19 s | Battery on a kitchen counter, charger plugged in, mug of coffee nearby | 2. Charge at room temperature. Let a cold battery warm up first |
| 19–24 s | Parent clicks battery into bike, kid in the box, rides off down a canal street | 3. Fit it just before you ride |
| 24–28 s | Bike rolling away, low winter sun | Range comes back in spring. Save this for frosty mornings |

**Alt text**
A Halden electric cargo bike's battery covered in frost on a cold Amsterdam morning.
````

## B026 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
That's a long wait, and silence on your emails makes it worse; sorry, Joost. We've just sent you a DM so our support team can check what's going on with your Kargo and get back to you there with a proper update.
````

## B027 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold mornings take range from your battery. Here's how to keep most of it.

**Body**
Lithium batteries don't like the cold, so plan for it. Bring the battery inside overnight; a hallway or kitchen is fine. Charge it at room temperature, not in a freezing shed. Clip it back on just before you ride. On our test rig (Halden report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range went from 62 km at 20 °C to 48 km at 0 °C. That's about a fifth less. Plan winter school runs and deliveries around that, and you won't be counting the last few bars.

**CTA**
Save this for the first frosty morning.

**Video script** (approx. 28 s, captions on throughout)

1. **0–2 s** | Close-up: frost on a cargo bike parked outside a canal house. Breath visible.
 On-screen: "Cold mornings take range from your battery."

2. **2–7 s** | Hands unclip the battery from the frame and carry it through a front door.
 On-screen: "Store it indoors overnight."

3. **7–12 s** | Battery on a kitchen floor, charger plugged in, indicator light on.
 On-screen: "Charge at room temperature, not in a cold shed."

4. **12–16 s** | Morning: parent clips the battery back on, kid in the box with a hat on.
 On-screen: "Clip it back on just before you ride."

5. **16–24 s** | Simple graphic over footage of the bike on a wet street: two bars, 20 °C and 0 °C.
 On-screen: "Our test: 62 km at 20 °C, 48 km at 0 °C"
 Small text: "Halden test TR-2026-09 · 545 Wh · 100 kg load · assist level 2"

6. **24–28 s** | Bike rolls away down a frosty street, Halden logo bottom corner.
 On-screen: "Plan for about a fifth less. Save this for winter."

**Alt text**
A person carries a cargo bike battery indoors past a frosted Halden cargo bike parked by an Amsterdam canal.
````

## B028 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold weather and your e-bike battery: three habits that help.

**Body**
1. Store it indoors. Bring the battery inside overnight, or park the bike somewhere sheltered.
2. Charge at room temperature. If it's been out in the cold, let it warm up before you plug it in.
3. Expect less range. In our test (Halden test rig report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C. That's about 14 km less. Your numbers will vary with load, route and assist level.

**CTA**
Check your battery tonight: if the bike lives outside, take the battery in with you.

**Video script** (30 s max)
- 0–3 s: Bike parked outside on a cold morning, breath visible. On-screen text: "Cold weather. Your battery."
- 3–10 s: Hand unclips the battery and carries it through the front door. Text: "1. Store it indoors."
- 10–17 s: Battery on a hallway shelf, charger plugged in, a hand checking that it's no longer cold to the touch. Text: "2. Charge it at room temperature."
- 17–26 s: Simple two-bar graphic. Text: "62 km at 20 °C. 48 km at 0 °C." Small source line: "Halden test TR-2026-09: 545 Wh, 100 kg load, assist level 2."
- 26–30 s: Battery back on the shelf. Text: "Take it in tonight."

Captions are on-screen text throughout, so the video works with sound off.

**Alt text**
Halden cargo bike on a frosty street, with a hand lifting the battery out to carry it indoors.
````

## B029 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Sorry about the wait, Joost, and about the silence on your emails; that's not the experience we want you to have. Please send us a DM so we can look into your order, and our support team will follow up with you there directly.
````

## B030 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Sorry for the wait, Joost, and for the emails going unanswered. We're sending you a direct message now so our support team can look into your order and get back to you with an update. Please keep an eye on your DMs.
````

## B031 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Sorry you've been left waiting, Joost, and that our emails haven't reached you. We're sending you a direct message now with the details and the person who will follow up on your order.
````

## B032 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold morning? Your battery feels it too.

**Body**
- Store it indoors. A battery kept warm starts the ride ready.
- Charge at room temperature. Bring it in first and let it warm up before you plug it in.
- Expect less range in the cold. In Halden test TR-2026-09 (545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C. That's 14 km less.
- Plan your ride with the lower figure in mind.

**CTA**
Bring your battery inside tonight.

**Video script** (28 s)
1. 0-3 s: Battery on a bike outside, frosty street. Text: "Cold morning? Your battery feels it too."
2. 3-8 s: Hand lifts the battery off the bike and carries it indoors. Text: "Store it indoors."
3. 8-13 s: Battery on a hallway shelf, then plugged in. Text: "Charge it at room temperature."
4. 13-23 s: Two simple cards. Text: "20 °C: 62 km" then "0 °C: 48 km". Small caption: "Halden test TR-2026-09. 545 Wh, 100 kg load, assist level 2."
5. 23-28 s: Rider setting off with the bike. Text: "Plan for the lower number. Bring your battery inside tonight."

Captions are on-screen text throughout, so the video works with the sound off.

**Alt text**
Halden cargo bike battery being carried indoors from a frosty street on a winter morning.
````

## B033 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold mornings shrink your range. Here's by how much, and what helps.

**Body**
Batteries don't like the cold. In our test rig report TR-2026-09 (545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C. That's about a quarter less on a freezing day.

Three habits help:
1. Store the battery indoors overnight, not in the shed.
2. Charge it at room temperature. Let a cold battery warm up first.
3. Click it in just before you ride, so it starts the trip warm.

Plan winter school runs and deliveries with that lower number in mind, and you won't get caught short.

**CTA**
Save this video for the first frosty morning.

**Video script** (approx. 28 s, captions on throughout)

| Time | Shot | On-screen text |
|---|---|---|
| 0–2 s | Frosty Amsterdam street, a Halden cargo bike parked by a canal, breath visible | Cold mornings shrink your range. |
| 2–8 s | Simple animated bar: 62 km at 20 °C drops to 48 km at 0 °C | 62 km at 20 °C → 48 km at 0 °C. Source: Halden TR-2026-09 (545 Wh, 100 kg load, assist 2) |
| 8–13 s | Rider unclips the battery and carries it into a hallway | 1. Store the battery indoors |
| 13–19 s | Battery on a kitchen counter next to the charger, wall thermometer reads about 20 °C | 2. Charge at room temperature. Let it warm up first. |
| 19–24 s | Battery clicked into the bike at the front door, kids climb into the box | 3. Fit it just before you ride |
| 24–28 s | Bike rolls off down the frosty street | Plan for about a quarter less range on freezing days. Save this for winter. |

**Alt text**
A Halden electric cargo bike parked beside a frosty Amsterdam canal while a rider carries its battery indoors.
````

## B034 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Hi Joost, sorry about the wait and the silence on your emails, that's not the experience we want you to have. We'll send you a DM today so our support team can look into your order and follow up with you directly.
````

## B035 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook** (first 2 seconds)
Cold weather cost one of our test batteries 14 km of range. Here's how to keep that loss small.

**Body**
Cold slows the chemistry inside a lithium battery, so it gives you less range until it warms up. Our test rig (report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2) reached 62 km at 20 °C and 48 km at 0 °C. That is a drop of 14 km, about 23%, under those test conditions. Your results will vary with load, terrain, and how hard you pedal.

Two habits help most:
- **Store the battery indoors** when the bike sits out in winter.
- **Charge it at room temperature.** If the battery is cold from the street, bring it inside and let it warm up before you plug it in.

Plan your route with the 48 km figure, not the 62 km one, on a cold morning.

**CTA** (one action)
Save this video and check the battery tips in the bike manual before the next cold snap.

**Video script** (max 30 s, captions on screen for sound-off viewing)

- **Shot 1 (0–3 s):** Cargo bike parked outside on a frosty morning, breath visible. On-screen text: "Cold cut our test range by 14 km."
- **Shot 2 (3–8 s):** Presenter talks to camera, hands on handlebars. On-screen text: "Cold slows the battery. It's not broken."
- **Shot 3 (8–14 s):** Close-up of a phone or simple graphic showing 62 km at 20 °C and 48 km at 0 °C. On-screen text: "Test rig TR-2026-09: 62 km at 20 °C, 48 km at 0 °C."
- **Shot 4 (14–20 s):** Presenter unclips battery and carries it indoors. On-screen text: "1. Store the battery indoors."
- **Shot 5 (20–25 s):** Battery sits on a shelf near a radiator, then goes onto the charger. On-screen text: "2. Let it reach room temperature before charging."
- **Shot 6 (25–30 s):** Presenter on the bike, smiling, end card. On-screen text: "Save this for the next cold morning." Halden Bikes logo.

**Alt text** (cover image)
A Halden cargo bike parked on a frosty Amsterdam street, with a battery tip overlay reading "Cold cut range by 14 km in our test."
````

## B036 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, Without Losing Control"
meta_description: "Tallymoor reads supplier invoices, routes them for approval and keeps your data in the EU, so controllers spend less time chasing and more time checking."
slug: "supplier-invoice-approval-for-finance-controllers"
---

## Your signature is the last check before money leaves the company

As a finance controller, you sign off on supplier invoices, and you own the result. Picture a 40-person AP team handling 6,000 invoices a month. Every invoice that reaches you has passed through manual keying, email forwards and reminder chains. When a line item is wrong or an approver is on holiday, the delay lands on your desk, and so does the late-payment fee.

You don't need more speed at the expense of scrutiny. You need clean data in front of you, and fewer invoices stuck waiting.

**Tallymoor handles the groundwork so your review counts.**

- **Accurate data from the start.** Tallymoor reads header and line-item fields from supplier PDFs with 97 % field accuracy. Accuracy is measured on header and line-item fields and varies by supplier layout. <!-- claim: C-001 -->
- **E-invoices arrive ready to review.** Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 -->
- **Approvals that move.** Customers cut median approval time from 9 days to 3 days. This is the median across our customer cohort, and individual results vary. <!-- claim: C-002 -->
- **Data that stays in Europe.** Customer data is hosted in the EU only. <!-- claim: C-008 -->

The business case is simple to check. Typical payback comes in under 9 months, and you can see how we calculate it on our [ROI method page]([LINK NEEDED: ROI method page URL]). <!-- claim: C-005 -->

Your team handles the invoices, and you keep the final say. Tallymoor makes sure what reaches you is complete, correct and on time.

**[Book a 30-minute walkthrough with your own invoice samples →]**
````

## B037 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: Faster supplier invoice approval for controllers
meta_description: Approve supplier invoices with less chasing and fewer manual checks. See how Tallymoor reads, routes and tracks invoices for finance controllers.
slug: supplier-invoice-approval-for-controllers
---

## You sign off the invoices. Someone else's inbox decides when.

You approve supplier invoices, and you carry the risk if one is wrong. Picture a 40-person AP team handling 6,000 invoices a month. A PDF arrives, someone retypes the header and each line, a coupon code or PO number is mistyped, and the invoice lands on your desk with a question mark. You send it back. The cycle repeats, and the payment date slips.

Most of that delay happens before you ever see the invoice.

## What changes when capture and routing are automated

Tallymoor reads header and line items from supplier PDFs with 97 % field accuracy. <!-- claim: C-001 --> That figure is measured on header and line-item fields and varies by supplier layout, so you can check it against your own suppliers' formats during a trial.

Suppliers do not all send PDFs. Tallymoor also receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, <!-- claim: C-004 --> so structured e-invoices and scanned documents arrive in the same queue and follow the same approval rules.

You then review fewer exceptions and see more of the context behind each one. Customers cut median approval time from 9 days to 3 days. <!-- claim: C-002 --> That is a median across a customer cohort, and individual results vary.

## Data stays where your auditors expect it

Customer data is hosted in the EU only. <!-- claim: C-008 -->

## What it means for the budget

Typical payback is under 9 months. <!-- claim: C-005 --> [CLAIM NEEDED: link to the ROI method page, required by the qualifier on C-005]

## See it on your own invoices

Send us a sample of last month's invoices from your ten most frequent suppliers. We will show you how they are read, routed and presented for approval.

[Book a walkthrough](#)
````

## B038 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook**
Cold morning, shorter range. Here's why, and what to do.

**Body**
- Store the battery indoors. A cold battery gives you less range.
- Charge it at room temperature, not straight off a freezing bike.
- Expect less range in the cold. In Halden test TR-2026-09 (545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C.
- That's 14 km less, about a quarter. Your own numbers will vary with load, assist level and route.

**CTA**
Take the battery inside tonight.

**Video script** (30 s max, captions on, no audio needed)
1. 0–3 s: Bike outside in frost, rider's breath visible. On-screen text: "Cold morning. Shorter range."
2. 3–9 s: Hands unclip the battery and carry it through a front door. Text: "1. Store it indoors."
3. 9–15 s: Battery on a hallway shelf plugged into the charger, a room-temperature thermometer in frame. Text: "2. Charge it at room temperature."
4. 15–25 s: Simple two-bar graphic. Text: "62 km at 20 °C. 48 km at 0 °C." Then: "Halden test TR-2026-09: 545 Wh, 100 kg load, assist level 2."
5. 25–30 s: Rider clicks the battery back in. Text: "Take it inside tonight. – Halden Bikes"

**Alt text**
Halden cargo bike parked in frost, with its battery being carried indoors in a gloved hand.
````

## B039 · writer/halden-public-reply: A public reply to an upset customer

### Task rubric

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.

### Answer

````text
Sorry for the wait and the silence on email, Joost, that's not how we want this to go. We've looked into it and someone from our support team will DM you today with a proper update.
````

## B040 · writer/halden-battery-cold: Brand copy for a how-to short

### Task rubric

```regex
Hook
Body
CTA
Video script
Alt text
48\s?km
TR-2026-09
indoors|inside
room temperature
```

```must-not
\b(safest|best|number one|zero emissions?|carbon[- ]neutral|eco-friendly|guaranteed|never breaks|maintenance[- ]free)\b
(^|\s)#[A-Za-z]
```

Rubric (blind scorer, 0-10):
- 3 points: the three facts of the brief (store indoors, charge at room temperature, the range loss from 62 to 48 km with the TR-2026-09 test conditions).
- 3 points: the voice: practical, warm, dry; "you"/"we"; no hype; reads as one person talking.
- 2 points: a script that fits 30 seconds, with on-screen text usable sound-off.
- 2 points: precise: no claim beyond the source (no "lasts longer", no invented percentages other than what 62 to 48 km gives, about 23 %).

### Answer

````text
**Hook** (first 2 seconds)
On-screen text: "Cold cut your range? Here's how much, and what to do."
Voice-over: "Cold weather takes range off your battery. Here's how much, and what to do about it."

**Body**
Cold slows the chemistry inside the battery, so it gives you less distance per charge. In our test rig (report TR-2026-09: 545 Wh battery, 100 kg load, assist level 2), range was 62 km at 20 °C and 48 km at 0 °C. That is 14 km less, about 23%. Plan your trip around the colder number.

Three habits help:
1. Store the battery indoors overnight, not in an unheated shed or garage.
2. Let the battery come up to room temperature before you charge it.
3. Check your planned route against the 0 °C figure on cold mornings.

**CTA** (one action)
Save this video and check your route against the 48 km figure before your next cold ride.

**Video script** (max 30 s)

- **Shot 1 (0–3 s):** Rider lifts the battery off the bike at a doorway, breath visible outside.
  On-screen text: "Cold cut your range? Here's how much."
- **Shot 2 (3–9 s):** Close-up of the battery going inside a warm hallway.
  On-screen text: "1. Store it indoors overnight."
- **Shot 3 (9–14 s):** Battery sitting on a shelf at room temperature, then plugged into the charger.
  On-screen text: "2. Charge at room temperature. Let it warm up first."
- **Shot 4 (14–21 s):** Rider checks a route on a phone, then cycles through a frosty street.
  On-screen text: "3. Plan for 48 km at 0 °C, not 62 km."
- **Shot 5 (21–26 s):** Split screen: "62 km at 20 °C" and "48 km at 0 °C."
  On-screen text: "Source: Halden test report TR-2026-09 (545 Wh, 100 kg load, assist level 2)."
- **Shot 6 (26–30 s):** Rider waves, bike parked in the hallway.
  On-screen text: "Save this for your next cold ride. Halden Bikes."

**Alt text** (cover image)
A rider in a warm Amsterdam hallway lifts an e-cargo bike battery off the frame, with the text "Cold cut your range? Here's how much."
````

## B041 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster | Tallymoor"
meta_description: "Approve supplier invoices with less manual checking. Tallymoor reads PDFs and e-invoices, keeps data in the EU and shortens approval cycles."
slug: "invoice-approval-for-finance-controllers"
---

## Approve with confidence, not with copy-paste

You sign off on what the business pays. That means checking that the invoice matches the order, that the VAT is right and that the amount lands in the correct cost centre. And it has to happen before the payment run. Picture a 40-person AP team handling 6,000 invoices a month. Every PDF that someone retypes is a chance for an error you have to catch. Every invoice waiting in an inbox pushes back a close you have already promised.

Tallymoor takes the retyping out of that chain. It reads header and line-item data from supplier PDFs with 97 % field accuracy, measured on header and line-item fields. Accuracy varies by supplier layout. <!-- claim: C-001 --> Structured e-invoices arrive ready to check: Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 --> You review the exceptions instead of every field.

The time saved shows up in your queue. Across our customer cohort, median approval time fell from 9 days to 3 days. Individual results vary. <!-- claim: C-002 --> For a team like the one above, that can mean fewer late-payment reminders and fewer surprises at month-end.

Your auditors will ask where the data lives. The answer is short: customer data is hosted in the EU only. <!-- claim: C-008 -->

The business case is just as plain. Typical payback is in under 9 months. See [how we calculate ROI](/roi-method). <!-- claim: C-005 -->

[CLAIM NEEDED: approved figure on invoices handled per AP team member after adoption]

**See your approval flow in Tallymoor.** [Book a 30-minute walkthrough](/demo)
````

## B042 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, With Fewer Errors"
meta_description: "Tallymoor reads supplier invoices, routes them for approval and accepts EU e-invoice formats, so finance controllers can approve with confidence."
slug: supplier-invoice-approval-for-finance-controllers
---

## Approve the invoices that matter, not the ones stuck in a queue

You sign off on supplier invoices, so you carry the risk when one is wrong. Picture a 40-person AP team handling 6,000 invoices a month. Each one needs its header checked, its line items matched and its approver chased. Invoices sit in inboxes, suppliers call about late payments and month-end close comes before the backlog clears.

Tallymoor takes the retyping and chasing off your desk. It reads the header and line items from supplier PDFs with 97 % field accuracy, measured on header and line-item fields. Accuracy varies by supplier layout. <!-- claim: C-001 --> Your team reviews exceptions instead of keying in every field.

Approvals move faster too. Customers cut median approval time from 9 days to 3 days. This is the median across the customer cohort, and individual results vary. <!-- claim: C-002 --> Invoices reach the right approver with the extracted data attached, so you can decide without opening three systems.

E-invoicing mandates are spreading across Europe, and your inbound channels need to keep up. Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 --> Structured and PDF invoices arrive in the same approval flow.

Your auditors and data protection officer will ask where invoice data lives. Customer data is hosted in the EU only. <!-- claim: C-008 -->

The business case is simple to put in front of your CFO. Typical payback comes in under 9 months, as calculated in our [ROI method](/roi-method). <!-- claim: C-005 --> To show the team-capacity gains you could expect after rollout, [CLAIM NEEDED: approved figure for invoices handled per AP staff member after adoption].

**See your own invoices in Tallymoor.** Book a demo and bring a sample month of supplier invoices.
````

## B043 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, With Fewer Errors"
meta_description: "Cut invoice approval time and re-keying for supplier invoices. See how Tallymoor reads PDFs and e-invoices for European AP teams."
slug: "faster-supplier-invoice-approval"
---

## Approve supplier invoices without chasing the paperwork

Your job as a finance controller is to confirm that each supplier invoice is correct before it's paid. When invoices arrive as a mix of PDFs, portal downloads and structured e-invoices, that check turns into hours of re-keying and back-and-forth with the AP team.

Picture a 40-person AP team handling 6,000 invoices a month. Approvers wait for invoices to be entered, then discover line items that don't match the purchase order. Every stalled invoice delays a supplier payment and pushes month-end close back.

Tallymoor reads header and line-item fields from supplier PDFs with 97 % field accuracy, measured on those fields; accuracy varies by supplier layout. <!-- claim: C-001 --> Approvers then review structured figures instead of typing them.

Structured e-invoices are handled too. Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices, so PDFs and e-invoices from different sources land in one approval queue. <!-- claim: C-004 -->

The results vary by team, but customers cut median approval time from 9 days to 3 days. Individual results vary. <!-- claim: C-002 -->

Typical payback is under 9 months. <!-- claim: C-005 --> To check the assumptions against your own invoice volumes, read the [CLAIM NEEDED: ROI method page URL].

Your invoice data stays in Europe: customer data is hosted in the EU only. <!-- claim: C-008 -->
````

## B044 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, With Fewer Errors"
meta_description: "Cut invoice approval waits and re-keying for AP teams. Accurate PDF extraction, e-invoice intake and EU-only data hosting for controllers."
slug: "faster-supplier-invoice-approval"
---

## Clear your approval queue without re-keying invoices

As a finance controller, your job is to confirm that every supplier invoice is correct before payment goes out, and to do it before the due date passes. Consider a 40-person AP team handling 6,000 invoices a month. The delay is rarely the approval decision itself. It is the time invoices spend waiting: sitting in shared inboxes, being chased by email, and being retyped from PDFs into the ledger.

Tallymoor reads header and line-item fields from supplier PDFs with 97 % field accuracy. This is measured on header and line-item fields, and accuracy varies by supplier layout. <!-- claim: C-001 -->

Less manual handling shortens the queue. Customers cut median approval time from 9 days to 3 days across the cohort, and individual results vary. <!-- claim: C-002 -->

Your suppliers already send structured e-invoices, so the platform needs to accept them without workarounds. Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 -->

Invoice data often includes supplier bank details and commercial terms, so where it is stored matters to your compliance team. Customer data is hosted in the EU only. <!-- claim: C-008 -->

Finance leaders also want to know when the investment pays back. Typical payback is under 9 months. <!-- claim: C-005 --> [CLAIM NEEDED: link to ROI method page]
````

## B045 · writer/tallymoor-landing-v2: Landing-page section with a claims register (v2)

### Task rubric

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.

### Answer

````text
---
title: "Approve Supplier Invoices Faster, With Fewer Surprises"
meta_description: "Tallymoor helps finance controllers check and approve supplier invoices faster: accurate line-item capture, e-invoice formats and EU-only hosting."
slug: "supplier-invoice-approval-for-finance-controllers"
---

## Your sign-off is the last line of defence

You approve the invoices, so you carry the risk. Picture a 40-person AP team handling 6,000 supplier invoices a month. Each invoice reaches you only after someone has keyed in the header, matched the line items against the purchase order and chased the budget owner. When a line is wrong, you find out at month-end close. When an approval sits in an inbox, the supplier calls you about late payment.

Tallymoor takes the manual work out of that chain, so the invoices that reach you are already checked.

**Accurate data before you look.** Tallymoor reads the header and line items from supplier PDFs with 97 % field accuracy, measured on header and line-item fields. Accuracy varies by supplier layout. <!-- claim: C-001 --> Exceptions are flagged for review, so you spend your time on the invoices that need judgement.

**E-invoices without extra tooling.** Tallymoor receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices. <!-- claim: C-004 --> Structured and PDF invoices arrive in one approval queue.

**Approvals that keep moving.** Across our customer cohort, median approval time fell from 9 days to 3 days. Individual results vary. <!-- claim: C-002 --> Fewer stalled approvals mean fewer supplier escalations and a calmer close.

**Capacity without new hires.** [CLAIM NEEDED: approved figure for invoice volume handled per AP team member after adoption]

**Data that stays in Europe.** Customer data is hosted in the EU only. <!-- claim: C-008 -->

**A business case you can defend.** Typical payback is under 9 months. <!-- claim: C-005 --> [See how we calculate ROI](/roi-method)

[Book a walkthrough with your own invoice samples →](/demo)
````
