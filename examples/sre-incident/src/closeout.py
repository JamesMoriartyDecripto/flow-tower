"""Close-out: status page updates, PagerDuty resolve, postmortem draft, session archive."""
from datetime import date
from os import environ
from pathlib import Path

import anthropic
import httpx

client = anthropic.Anthropic()
SP = "https://api.statuspage.io/v1/pages/kctbh9vrtdwd"
PD = "https://api.pagerduty.com"
POSTMORTEMS = Path(__file__).resolve().parent.parent / "postmortems"


def statuspage_update(incident_sp_id: str | None, status: str, body: str) -> str:
    """status: investigating | identified | monitoring | resolved. Body drafted by Haiku."""
    headers = {"Authorization": f"OAuth {environ['STATUSPAGE_API_KEY']}"}
    payload = {"incident": {"name": "Checkout errors", "status": status, "body": body,
                            "component_ids": [environ["SP_CHECKOUT_COMPONENT"]]}}
    if incident_sp_id:
        r = httpx.patch(f"{SP}/incidents/{incident_sp_id}", json=payload, headers=headers, timeout=20)
    else:
        r = httpx.post(f"{SP}/incidents", json=payload, headers=headers, timeout=20)
    return r.json()["id"]


def resolve_pagerduty(incident_id: str, resolution: str) -> None:
    headers = {"Authorization": f"Token token={environ['PAGERDUTY_TOKEN']}",
               "From": environ["PAGERDUTY_FROM_EMAIL"]}
    httpx.put(f"{PD}/incidents/{incident_id}", headers=headers, timeout=20, json={
        "incident": {"type": "incident_reference", "status": "resolved", "resolution": resolution}})


def write_postmortem(incident_number: int, service: str, markdown: str) -> dict:
    """Custom tool for the postmortem writer: a draft file, opened as a PR for human review."""
    path = POSTMORTEMS / f"{date.today().isoformat()}-{service}-{incident_number}.md"
    path.write_text(markdown)
    return {"path": str(path.name), "status": "draft", "review": "postmortem review within 72h"}


def archive(session_ids: list[str]) -> None:
    for sid in session_ids:
        client.beta.sessions.archive(sid)  # the trace stays visible in the Console
