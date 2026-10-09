"""Build a Fatture in Cloud issued-document payload for one billing-plan row, verify, send.

Usage: python scripts/fic_invoice.py row.json [--create] [--send]
row.json: {"kind": "milestone", "deal": {...}, "company": {...}, "share": 0.4, "milestone_name": "Go-live",
           "ids": {"vat_22": 0, "bank_account": 0, "bonifico": 0}}
Without flags it prints the payload only (finance reviews it in Slack). --send always does a
dry run first. Credentials come from the environment (FIC_COMPANY_ID, FIC_ACCESS_TOKEN).
The full invoicing workflow lives in examples/invoicing-fic; this is the sales-side trigger.
"""
import json
import os
import sys
import time
from datetime import date, timedelta

import requests

BASE = "https://api-v2.fattureincloud.it"


def payload(row: dict) -> dict:
    deal, co, ids = row["deal"], row["company"], row["ids"]
    net = round(deal["amount"] * row["share"], 2)
    gross = round(net * 1.22, 2)
    use_pec = not co.get("sdi_code")
    return {"data": {
        "type": "proforma" if row["kind"] == "deposit" else "invoice",
        "date": date.today().isoformat(),
        "e_invoice": row["kind"] != "deposit",
        "subject": f"{deal['quote_number']} - {row['milestone_name']}",
        "entity": {"name": co["legal_name"], "vat_number": co["vat_number"], "tax_code": co.get("tax_code", ""),
                   "address_street": co["address"], "address_postal_code": co["zip"],
                   "address_city": co["city"], "address_province": co["province"], "country": "Italia",
                   "e_invoice": True, "ei_code": "0000000" if use_pec else co["sdi_code"],
                   "certified_email": co.get("pec", "") if use_pec else ""},
        "items_list": [{"name": row["milestone_name"], "net_price": net, "qty": 1, "vat": {"id": ids["vat_22"]}}],
        "payments_list": [{"amount": gross, "status": "not_paid", "payment_account": {"id": ids["bank_account"]},
                           "due_date": (date.today() + timedelta(days=deal.get("payment_terms_days", 30))).isoformat()}],
        "payment_method": {"id": ids["bonifico"]},
        "ei_data": {"payment_method": "MP05", "vat_kind": "S" if co.get("split_payment") else "I"},
    }}


def call(method: str, path: str, **kw) -> dict:
    cid, token = os.environ["FIC_COMPANY_ID"], os.environ["FIC_ACCESS_TOKEN"]
    for attempt in range(5):
        r = requests.request(method, f"{BASE}/c/{cid}{path}", headers={"Authorization": f"Bearer {token}"},
                             timeout=30, **kw)
        if r.status_code in (429, 403) and "Retry-After" in r.headers:
            time.sleep(int(r.headers["Retry-After"]) * (attempt + 1))  # quota or burst limit
            continue
        r.raise_for_status()
        return r.json() if r.content else {}
    raise RuntimeError(f"{method} {path}: rate limited 5 times")


if __name__ == "__main__":
    body = payload(json.load(open(sys.argv[1])))
    if "--create" not in sys.argv:
        print(json.dumps(body, indent=2, ensure_ascii=False))
        sys.exit(0)
    doc_id = call("POST", "/issued_documents", json=body)["data"]["id"]
    if body["data"]["e_invoice"]:
        call("GET", f"/issued_documents/{doc_id}/e_invoice/xml_verify")
        if "--send" in sys.argv:
            call("POST", f"/issued_documents/{doc_id}/e_invoice/send", json={"options": {"dry_run": True}})
            call("POST", f"/issued_documents/{doc_id}/e_invoice/send", json={"data": {}})
    print(json.dumps({"document_id": doc_id, "sent": "--send" in sys.argv}))
