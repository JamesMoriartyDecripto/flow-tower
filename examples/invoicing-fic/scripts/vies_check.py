"""VIES VAT number check over the European Commission REST API (validate.vies).

Spec: https://ec.europa.eu/assets/taxud/vow-information/swagger_publicVAT.yaml
POST /check-vat-number {countryCode, vatNumber, requesterMemberStateCode?, requesterNumber?}
-> {valid, name, address, requestDate, requestIdentifier?, ...}. No API key.
requestIdentifier is only returned when the requester's own VAT number is sent: keep it as
evidence for intra-EU non-taxable supplies.
Usage: python scripts/vies_check.py DE 000000000
"""
import json
import sys
import time

import requests

BASE = "https://ec.europa.eu/taxation_customs/vies/rest-api"
REQUESTER = {"requesterMemberStateCode": "IT", "requesterNumber": "00000000000"}  # placeholder


def check(country: str, number: str, retries: int = 3) -> dict:
    body = {"countryCode": country.upper(), "vatNumber": number.replace(" ", ""), **REQUESTER}
    for attempt in range(retries + 1):
        try:
            resp = requests.post(f"{BASE}/check-vat-number", json=body, timeout=20)
        except requests.RequestException as exc:
            error = str(exc)
        else:
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "status": "valid" if data.get("valid") else "invalid",
                    "name": data.get("name"),
                    "address": data.get("address"),
                    "request_date": data.get("requestDate"),
                    "request_identifier": data.get("requestIdentifier"),
                }
            # Errors come back as {actionSucceed: false, errorWrappers: [{error, message}]}.
            # Member-state or service unavailability is NOT an invalid number.
            error = resp.text[:300]
        if attempt < retries:
            time.sleep(min(300, 5 * 2 ** attempt))
    return {"status": "unavailable", "error": error}


if __name__ == "__main__":
    print(json.dumps(check(sys.argv[1], sys.argv[2]), indent=2))
