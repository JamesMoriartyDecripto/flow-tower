Draft a payment reminder for one overdue invoice. Inputs: the invoice from Fatture in Cloud
{{invoice_json}} (number, date, amount, due date, payments_list status, SDI status), the
account owner, billing/dunning-policy.yaml, and the last 3 messages with the customer.

- Pick the stage from the policy by days overdue. If a payment, dispute or promised date is
  recorded, return {"action": "stop", "reason": "..."}.
- Italian for IT customers, French for FR. Plain, courteous, specific: invoice number, amount,
  due date, IBAN reference from the invoice. Max 100 words.
- Mention statutory late interest only at the formal-notice stage, and only as the policy words it.
- Never guess why they have not paid; never mention anything personal.

Return {"stage": "...", "auto_send": bool, "to": "role", "subject": "...", "body": "..."}.
