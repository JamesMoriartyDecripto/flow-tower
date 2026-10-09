"""In-process MCP server `workspace`: Gmail and Calendar with the user's own OAuth token.

Read tools are pre-approved. send_email and send_invite are gated by the PreToolUse
send-gate hook: they only run for a review card the user approved.
"""
import base64
from email.message import EmailMessage

from claude_agent_sdk import create_sdk_mcp_server, tool
from googleapiclient.discovery import build

from ambient.oauth import user_credentials  # refresh token from the user's consent, never a service account

gmail = build("gmail", "v1", credentials=user_credentials())
calendar = build("calendar", "v3", credentials=user_credentials())


def _text(s: str) -> dict:
    return {"content": [{"type": "text", "text": s}]}


@tool("get_thread", "Read an email thread.", {"thread_id": str})
async def get_thread(args):
    t = gmail.users().threads().get(userId="me", id=args["thread_id"], format="full").execute()
    return _text(str([m["snippet"] for m in t["messages"]]))


@tool("free_busy", "Busy blocks on the primary calendar.", {"time_min": str, "time_max": str})
async def free_busy(args):
    body = {"timeMin": args["time_min"], "timeMax": args["time_max"], "items": [{"id": "primary"}]}
    return _text(str(calendar.freebusy().query(body=body).execute()["calendars"]["primary"]))


@tool("mark_read", "Archive-free 'ignore': mark the thread's messages as read.", {"message_id": str})
async def mark_read(args):
    gmail.users().messages().modify(userId="me", id=args["message_id"],
                                    body={"removeLabelIds": ["UNREAD"]}).execute()
    return _text("marked read")


@tool("send_email", "Send an approved reply.", {"review_id": str, "to": str, "subject": str, "body": str})
async def send_email(args):
    msg = EmailMessage()
    msg["To"], msg["Subject"] = args["to"], args["subject"]
    msg.set_content(args["body"])
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = gmail.users().messages().send(userId="me", body={"raw": raw}).execute()
    return _text(f"sent {sent['id']}")


@tool("send_invite", "Create an approved meeting and email invites.",
      {"review_id": str, "title": str, "start": str, "end": str, "attendees": str})
async def send_invite(args):
    event = {"summary": args["title"], "start": {"dateTime": args["start"]},
             "end": {"dateTime": args["end"]},
             "attendees": [{"email": e.strip()} for e in args["attendees"].split(",")]}
    created = calendar.events().insert(calendarId="primary", body=event, sendUpdates="all").execute()
    return _text(f"invite {created['id']}")


workspace_server = create_sdk_mcp_server(
    name="workspace", version="1.0.0",
    tools=[get_thread, free_busy, mark_read, send_email, send_invite])
