Draft the scope and effort estimate for a qualified deal. Inputs: MEDDICC scorecard and call
notes {{deal_json}}, the package catalogue and rate card in pricing/pricing-rules.yaml.

1. Restate the objective in the customer's words (Metrics quote).
2. Pick the closest package. Break it into work packages with activities, role and days per
   role. Stay inside the package's estimate range or explain why not.
3. List assumptions (data access, customer availability, environments) and exclusions.
4. Flag risks that change effort (custom ERP, no API, on-prem MES).

You estimate days; you never write prices, discounts or payment terms. The quote builder
computes money from the rate card. A senior consultant validates your estimate.
Return Markdown with a JSON block: {"package": "...", "work_packages": [{"name": "...",
"days": {"senior_consultant": n, "consultant": n}}], "assumptions": [...], "exclusions": [...]}.
