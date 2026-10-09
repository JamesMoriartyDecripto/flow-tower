"""Approval timeout: escalate in PagerDuty and unblock the agent with "escalated" (never "approved")."""
from os import environ
from pathlib import Path

import httpx
import yaml

from slack_approval import pending_approvals, resolve

PD = "https://api.pagerduty.com"
POLICY_FILE = Path(__file__).resolve().parent.parent / "config/escalation.yaml"


def read_policy() -> dict:
    return yaml.safe_load(POLICY_FILE.read_text())


def escalate_unanswered(session_id: str, event_id: str, summary: str) -> None:
    value = f"{session_id}:{event_id}"
    if value not in pending_approvals:  # a human already decided
        return
    policy = read_policy()
    incident_id = _incident_for(session_id)
    headers = {"Authorization": f"Token token={environ['PAGERDUTY_TOKEN']}",
               "From": environ["PAGERDUTY_FROM_EMAIL"]}
    httpx.put(f"{PD}/incidents/{incident_id}", headers=headers, timeout=20, json={"incident": {
        "type": "incident_reference",
        "escalation_level": policy["escalation"]["reassign_to_level"]}})
    httpx.post(f"{PD}/incidents/{incident_id}/notes", headers=headers, timeout=20, json={
        "note": {"content": f"Fix awaiting approval for 15m, escalated. {summary}"}})
    resolve(value, "escalated", "timeout")


def _incident_for(session_id: str) -> str:
    from state import r
    for key in r.scan_iter("incident:*"):
        if r.get(key) == session_id:
            return key.split(":", 1)[1]
    raise KeyError(session_id)
