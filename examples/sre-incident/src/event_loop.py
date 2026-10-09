"""Drive one incident session: service custom tools, hand off to the remediator, arm the approval timer.

Investigation and remediation are two agents in two sessions; the handoff is the
investigator's findings block sent as the remediator's first user.message.
"""
import json
import threading
import time

import anthropic

from escalation import escalate_unanswered, read_policy
from slack_approval import post_for_approval
from tools import HANDLERS

client = anthropic.Anthropic()
POLICY = read_policy()  # config/escalation.yaml


def run_until_approval_or_end(session_id: str) -> str | None:
    """Poll events; answer data tools at once, park request_approval for a human."""
    seen, pending = set(), {}
    while True:
        for ev in client.beta.sessions.events.list(session_id):
            if ev.id in seen:
                continue
            seen.add(ev.id)
            if ev.type == "agent.custom_tool_use":
                pending[ev.id] = ev
            elif ev.type == "session.status_idle" and ev.stop_reason.type == "requires_action":
                for event_id in ev.stop_reason.event_ids:
                    call = pending.pop(event_id)
                    if call.name == "request_approval":
                        _park(session_id, event_id, call.input["summary"])
                        return event_id
                    result = HANDLERS[call.name](**call.input)
                    client.beta.sessions.events.send(session_id, events=[{
                        "type": "user.custom_tool_result", "custom_tool_use_id": event_id,
                        "content": [{"type": "text", "text": json.dumps(result)}]}])
            elif ev.type == "session.status_idle" and ev.stop_reason.type == "end_turn":
                return None
            elif ev.type == "session.status_terminated":
                return None
        time.sleep(1.0)


def _park(session_id: str, event_id: str, summary: str) -> None:
    post_for_approval(session_id, event_id, summary)
    timeout = POLICY["approval"]["timeout_seconds"]  # 900 = 15m
    timer = threading.Timer(timeout, escalate_unanswered, args=(session_id, event_id, summary))
    timer.daemon = True
    timer.start()


def hand_off(findings: str, remediator_session: str) -> None:
    client.beta.sessions.events.send(remediator_session, events=[{
        "type": "user.message", "content": [{"type": "text", "text": findings}]}])
    run_until_approval_or_end(remediator_session)

