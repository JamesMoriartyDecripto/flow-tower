"""Fatture in Cloud webhook receiver (sdi.receiver, passive.received).

Contract (developers.fattureincloud.it/docs/webhooks/): CloudEvents 1.0, binary mode (ce-* headers);
Authorization: Bearer <JWT ES256> signed with the public key published on the Notifications page;
claims jti == ce-id, sub == ce-subject, aud == our sink, exp 3h after issue. Body: {"data": {"ids": [...]}}
with no resource data. Delivery is at-least-once: dedupe on ce-id. Answer fast (2xx) and work async;
5xx is retried (4 attempts), other codes are not, and errors for 10 days expire the subscription.
Subscription verification: GET with x-fic-verification-challenge -> {"verification": <challenge>}.
"""
import base64
import json
import sqlite3
from os import environ

import jwt  # PyJWT with cryptography for ES256
from flask import Flask, abort, jsonify, request

SINK = "https://finance-agents.brezza-sensori.example/webhooks/fic"
PUBLIC_KEY = base64.b64decode(environ["FIC_WEBHOOK_PUBLIC_KEY_B64"])  # copied from the docs page
app = Flask(__name__)
db = sqlite3.connect("webhooks.db", check_same_thread=False)  # demo; production: ledger table
db.execute("CREATE TABLE IF NOT EXISTS seen (ce_id TEXT PRIMARY KEY, type TEXT, time TEXT, ids TEXT)")


@app.get("/webhooks/fic")
def verify_subscription():
    challenge = request.headers.get("x-fic-verification-challenge") or request.args.get("x-fic-verification-challenge")
    if not challenge:
        abort(400)
    return jsonify({"verification": challenge})


@app.post("/webhooks/fic")
def notification():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    try:
        claims = jwt.decode(token, PUBLIC_KEY, algorithms=["ES256"], audience=SINK,
                            options={"require": ["exp", "jti", "sub", "aud"]})
    except jwt.PyJWTError:
        abort(401)  # unretryable on purpose: a forged call must not be retried
    ce_id, ce_type = request.headers.get("ce-id"), request.headers.get("ce-type", "")
    if claims["jti"] != ce_id or claims["sub"] != request.headers.get("ce-subject"):
        abort(401)
    if "fattureincloud.it" not in str(claims.get("iss", "")):
        abort(401)

    ids = (request.get_json(silent=True) or {}).get("data", {}).get("ids", [])
    try:
        db.execute("INSERT INTO seen VALUES (?, ?, ?, ?)",
                   (ce_id, ce_type, request.headers.get("ce-time"), json.dumps(ids)))
        db.commit()
    except sqlite3.IntegrityError:
        return "", 204  # duplicate delivery: already queued

    enqueue(ce_type, ids, request.headers.get("ce-time"))
    return "", 202


def enqueue(ce_type: str, ids: list, ce_time: str):
    """Route by event type; workers re-read each resource (ordering by ce-time, not arrival)."""
    if ce_type.endswith("issued_documents.e_invoices.status_update"):
        queue = "sdi-status"           # -> get_issued_document(fields=ei_status)
    elif ce_type.endswith("received_documents.e_invoices.receive"):
        queue = "passive-pending"      # -> get_pending_received_document
    else:
        queue = "fic-misc"
    print(json.dumps({"queue": queue, "ids": ids, "ce_time": ce_time}))  # stand-in for Pub/Sub publish
