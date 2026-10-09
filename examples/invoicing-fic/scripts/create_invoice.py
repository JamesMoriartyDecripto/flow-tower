"""Idempotent invoice creation in Fatture in Cloud (approve.create).

One idempotency key per request (source:deal_or_contract:milestone_or_period). The key and the
returned document id are stored together, so a retry, a duplicate webhook or a second click
returns the existing invoice instead of creating (and numbering) a new one.
Usage: python scripts/create_invoice.py payload.json <idempotency_key>
"""
import json
import sqlite3
import sys

import fattureincloud_python_sdk

from fic_client import api_client, call, company_id, refresh_access_token

LEDGER = "ledger.db"  # demo stand-in; production uses the EU Postgres ledger with a unique index


def ledger():
    db = sqlite3.connect(LEDGER)
    db.execute("CREATE TABLE IF NOT EXISTS issued (key TEXT PRIMARY KEY, doc_id INTEGER, number TEXT)")
    return db


def existing_in_fic(api, key: str):
    """Second line of defence: the key is also written in the internal subject.
    Assumption: 'subject' is filterable with q; verify on the API reference before relying on it."""
    res = call(api.list_issued_documents, company_id(), "invoice",
               q=f"subject = 'req:{key}'", fields="id,number,numeration")
    return res.data[0] if res.data else None


def create(payload: dict, key: str, secrets) -> dict:
    db = ledger()
    row = db.execute("SELECT doc_id, number FROM issued WHERE key = ?", (key,)).fetchone()
    if row:
        return {"doc_id": row[0], "number": row[1], "created": False}

    with api_client(refresh_access_token(secrets)) as client:
        api = fattureincloud_python_sdk.IssuedDocumentsApi(client)
        found = existing_in_fic(api, key)
        if found:
            db.execute("INSERT INTO issued VALUES (?, ?, ?)", (key, found.id, f"{found.number}{found.numeration or ''}"))
            db.commit()
            return {"doc_id": found.id, "number": found.number, "created": False}

        payload["data"]["subject"] = f"req:{key}"
        totals = call(api.get_new_issued_document_totals, company_id(),
                      get_new_issued_document_totals_request={"data": payload["data"]})
        expected = payload.get("expected_amount_gross")
        if expected is not None and abs(totals.data.amount_gross - expected) > 0.01:
            raise ValueError(f"totals mismatch: FIC {totals.data.amount_gross} vs order {expected}")

        # No retry here: a timeout after the POST may still have created the document.
        # The next run finds it through the ledger or existing_in_fic().
        doc = api.create_issued_document(company_id(), create_issued_document_request={"data": payload["data"]}).data
        db.execute("INSERT INTO issued VALUES (?, ?, ?)", (key, doc.id, f"{doc.number}{doc.numeration or ''}"))
        db.commit()
        return {"doc_id": doc.id, "number": doc.number, "created": True}


if __name__ == "__main__":
    from secrets_store import SecretStore  # thin wrapper over Secret Manager, not in this example

    payload = json.load(open(sys.argv[1]))
    print(json.dumps(create(payload, sys.argv[2], SecretStore()), indent=2))
