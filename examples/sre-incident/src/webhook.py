"""PagerDuty V3 webhook -> one Managed Agents session per incident."""
import hashlib
import hmac
import json
from os import environ

import anthropic
from fastapi import FastAPI, Header, HTTPException, Request

from slack_approval import open_incident_channel
from state import AGENTS, ENV_ID, RESOURCES, remember_session, seen_incident

app = FastAPI()
client = anthropic.Anthropic()
SECRET = environ["PAGERDUTY_WEBHOOK_SECRET"].encode()


def _valid(body: bytes, header: str) -> bool:
    # X-PagerDuty-Signature: "v1=<hex>[,v1=<hex>]" (several during secret rotation)
    digest = hmac.new(SECRET, body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(sig.strip()[3:], digest) for sig in header.split(","))


@app.post("/pagerduty")
async def pagerduty(request: Request, x_pagerduty_signature: str = Header("")):
    body = await request.body()
    if not _valid(body, x_pagerduty_signature):
        raise HTTPException(401, "bad signature")
    payload = json.loads(body)
    if payload["event"]["event_type"] != "incident.triggered":
        return {"ignored": payload["event"]["event_type"]}
    incident = payload["event"]["data"]
    if session_id := seen_incident(incident["id"]):  # redelivery or re-trigger
        return {"session": session_id, "deduped": True}
    return {"session": handle_pagerduty_webhook(payload)}


def handle_pagerduty_webhook(payload: dict) -> str:
    incident = payload["event"]["data"]
    session = client.beta.sessions.create(
        environment_id=ENV_ID,
        agent={"type": "agent", "id": AGENTS["investigator"].id, "version": AGENTS["investigator"].version},
        resources=RESOURCES,  # infra repo checkout, runbooks, recent log snapshot
        title=f"[{incident['service']['summary']}] {incident['title']}",
    )
    # The raw alert is the first user.message: the system prompt stays persona + workflow only.
    client.beta.sessions.events.send(session.id, events=[{
        "type": "user.message",
        "content": [{"type": "text", "text": json.dumps(payload, indent=2)}],
    }])
    remember_session(incident["id"], session.id)
    open_incident_channel(incident, session.id)
    return session.id
