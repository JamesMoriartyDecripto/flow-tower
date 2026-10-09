"""AP2 mandate checks: ES256 JWT signatures, mandate constraints, double spend.

The Checkout Mandate is signed by the merchant agent (key agent_pk); the Payment Mandate by
the Trusted Surface key, whose private half never leaves the host.
"""
import hashlib
from os import environ

import jwt  # PyJWT with the cryptography extra
from cryptography.hazmat.primitives.serialization import load_pem_public_key

TRUSTED_SURFACE_PK = load_pem_public_key(open(environ["AP2_TRUSTED_SURFACE_PEM"], "rb").read())


def _decode(token: str, key) -> dict | None:
    try:
        return jwt.decode(token, key, algorithms=["ES256"], options={"require": ["exp", "iat"]})
    except jwt.PyJWTError:
        return None


def verify(txn: dict, receipts) -> dict:
    agent_key = load_pem_public_key(txn["agent_pk"].encode())
    checkout = _decode(txn["checkout_mandate_jwt"], agent_key)
    payment = _decode(txn["payment_mandate_jwt"], TRUSTED_SURFACE_PK)
    valid = checkout is not None and payment is not None

    constraints = valid and (
        payment["amount"] == txn["amount"]
        and payment["currency"] == txn.get("currency", "USD")
        and payment["checkout_hash"] == hashlib.sha256(txn["checkout_mandate_jwt"].encode()).hexdigest()
        and txn["amount"] <= checkout.get("max_amount", txn["amount"])
    )
    # Same mandate already approved once = replay.
    double_spend = receipts.count_documents({"mandate_id": txn["mandate_id"], "decision": "approve"}) > 0

    detail = ("signature" if not valid else "constraints" if not constraints
              else "double_spend" if double_spend else "ok")
    return {"valid": valid, "constraints_satisfied": bool(constraints),
            "double_spend_detected": double_spend, "detail": detail}
