---
id: deadlines-email
category: data
check: json
steps: 1
---
# Extract the deadlines from an email

From real work: the commercialista example's deadline sweep reads dates that clients and offices send in plain text.

## Prompt

Extract every deadline in this email as a JSON array of objects with exactly the keys `what` (one of `f24`, `cpb`, `ires-acconto`, `lipe`), `date` (YYYY-MM-DD) and `amount` (number in euro, or null when the email gives none), in the order the email mentions them. Reply with the JSON array and nothing else.

```
Hi, quick recap for Lumen Grid before your trip. The second IRES advance (acconto) of EUR 18,400.00 is due on 30 November 2026, and the same day is the last day for the Q3 LIPE. The CPB adhesion must be sent by 2 November 2026; no payment is attached to it. Finally, the monthly F24 with withholding taxes, EUR 3,912.50, goes out on 16/11/2026.
```

## Expected

```json
[{"what":"ires-acconto","date":"2026-11-30","amount":18400},{"what":"lipe","date":"2026-11-30","amount":null},{"what":"cpb","date":"2026-11-02","amount":null},{"what":"f24","date":"2026-11-16","amount":3912.5}]
```
