"""Verify, dry-run, send and read the SDI outcome of one issued document (sub-tower sdi-loop).

Endpoints (IssuedEInvoicesApi, official Python SDK):
  verify_e_invoice_xml            GET  /c/{cid}/issued_documents/{id}/e_invoice/xml_verify
  send_e_invoice                  POST /c/{cid}/issued_documents/{id}/e_invoice/send  (options.dry_run)
  get_e_invoice_rejection_reason  GET  /c/{cid}/issued_documents/{id}/e_invoice/error_reason
ei_status is only returned with fields=ei_status or fieldset=detailed.
Usage: python scripts/send_and_poll.py <document_id> [--dry-run]
"""
import json
import sys

import fattureincloud_python_sdk
from fattureincloud_python_sdk.rest import ApiException

from fic_client import api_client, call, company_id, refresh_access_token

FINAL = {"sent", "not_delivered", "accepted", "rejected", "no_response", "manual_accepted", "manual_rejected"}
WAIT = {"attempt", "pending", "processing"}
FIX = {"discarded", "error"}


def ei_status(docs_api, doc_id: int) -> str:
    doc = call(docs_api.get_issued_document, company_id(), doc_id, fields="id,number,ei_status").data
    return doc.ei_status


def verify(ei_api, doc_id: int):
    try:
        call(ei_api.verify_e_invoice_xml, company_id(), doc_id)
        return []
    except ApiException as exc:
        if exc.status == 422:  # validation_result lists what to fix before sending
            return json.loads(exc.body or "{}").get("error", {}).get("validation_result", [exc.body])
        raise


def send(ei_api, docs_api, doc_id: int, dry_run: bool) -> dict:
    status = ei_status(docs_api, doc_id)
    if status not in ("not_sent", "discarded", None):
        return {"skipped": True, "ei_status": status}  # never send twice
    problems = verify(ei_api, doc_id)
    if problems:
        return {"sent": False, "validation_result": problems}
    request = {"data": {}, "options": {"dry_run": dry_run}}
    # One attempt only: on a timeout the next run re-reads ei_status before trying again.
    ei_api.send_e_invoice(company_id(), doc_id, send_e_invoice_request=request)
    return {"sent": not dry_run, "dry_run": dry_run}


def outcome(ei_api, docs_api, doc_id: int) -> dict:
    status = ei_status(docs_api, doc_id)
    result = {"ei_status": status, "final": status in FINAL, "wait": status in WAIT}
    if status in FIX:
        reason = call(ei_api.get_e_invoice_rejection_reason, company_id(), doc_id).data
        result["rejection"] = {"code": reason.code, "reason": reason.reason, "date": str(reason.date)}
    return result


if __name__ == "__main__":
    from secrets_store import SecretStore  # thin wrapper over Secret Manager, not in this example

    doc_id, dry = int(sys.argv[1]), "--dry-run" in sys.argv
    with api_client(refresh_access_token(SecretStore())) as client:
        ei = fattureincloud_python_sdk.IssuedEInvoicesApi(client)
        docs = fattureincloud_python_sdk.IssuedDocumentsApi(client)
        result = send(ei, docs, doc_id, dry_run=dry)
        result["outcome"] = outcome(ei, docs, doc_id)
        print(json.dumps(result, indent=2))
