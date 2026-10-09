"""Incident channel + the request_approval gate in Slack (Bolt for Python).

Buttons carry "<session_id>:<event_id>" so a click resumes exactly the paused tool call.
Only members of the on-call user group may decide; the timeout escalates via PagerDuty.
"""
from os import environ

import anthropic
from slack_bolt import App

from state import oncall_user_ids, pending_approvals

slack = App(token=environ["SLACK_BOT_TOKEN"], signing_secret=environ["SLACK_SIGNING_SECRET"])
client = anthropic.Anthropic()
ONCALL_CHANNEL = environ.get("ONCALL_CHANNEL", "#payments-oncall")


def open_incident_channel(incident: dict, session_id: str) -> str:
    name = f"inc-{incident['number']}-{incident['service']['summary']}"[:80]
    channel = slack.client.conversations_create(name=name)["channel"]["id"]
    slack.client.chat_postMessage(channel=channel, text=(
        f":rotating_light: *{incident['title']}* ({incident['urgency']})\n"
        f"PagerDuty: {incident['html_url']}\nAgent session: `{session_id}`"))
    return channel


def post_for_approval(session_id: str, event_id: str, summary: str) -> None:
    value = f"{session_id}:{event_id}"
    slack.client.chat_postMessage(channel=ONCALL_CHANNEL, text=f"Approval needed: {summary}", blocks=[
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Fix ready for review*\n{summary}"}},
        {"type": "actions", "elements": [
            {"type": "button", "style": "primary", "action_id": "approve",
             "text": {"type": "plain_text", "text": "Approve"}, "value": value},
            {"type": "button", "style": "danger", "action_id": "reject",
             "text": {"type": "plain_text", "text": "Reject"}, "value": value},
        ]},
    ])
    pending_approvals.add(value)  # the escalation timer (15m) is armed in event_loop.py


def resolve(value: str, decision: str, user: str) -> None:
    session_id, event_id = value.split(":", 1)
    client.beta.sessions.events.send(session_id, events=[{
        "type": "user.custom_tool_result",
        "custom_tool_use_id": event_id,
        "content": [{"type": "text", "text": f'{{"decision": "{decision}", "by": "{user}"}}'}],
    }])
    pending_approvals.discard(value)


def _decide(decision: str):
    def handler(ack, body, client, logger):
        ack()
        user, value = body["user"]["id"], body["actions"][0]["value"]
        if user not in oncall_user_ids() or value not in pending_approvals:
            client.chat_postEphemeral(channel=body["channel"]["id"], user=user,
                                      text="Only the current on-call can decide, once.")
            return
        resolve(value, decision, user)
        client.chat_update(channel=body["channel"]["id"], ts=body["message"]["ts"],
                           text=f"{decision.title()} by <@{user}>", blocks=[])
        logger.info("approval %s %s by %s", value, decision, user)
    return handler


slack.action("approve")(_decide("approved"))
slack.action("reject")(_decide("rejected"))
