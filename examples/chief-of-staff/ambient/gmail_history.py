"""Turns a Gmail push (historyId only) into the new inbound messages since the last one seen."""
import json
from pathlib import Path

from ambient.workspace_tools import gmail

CURSOR = Path(__file__).resolve().parent.parent / "memory" / "gmail_cursor.json"


def last_history_id() -> str:
    return json.loads(CURSOR.read_text())["history_id"] if CURSOR.exists() else "1"


def primary_address() -> str:
    return gmail.users().getProfile(userId="me").execute()["emailAddress"]


def new_messages(address: str, history_id: str):
    start = min(int(history_id), int(last_history_id()))
    resp = gmail.users().history().list(userId="me", startHistoryId=str(start),
                                        historyTypes=["messageAdded"]).execute()
    for record in resp.get("history", []):
        for added in record.get("messagesAdded", []):
            m = gmail.users().messages().get(userId="me", id=added["message"]["id"],
                                             format="metadata").execute()
            headers = {h["name"]: h["value"] for h in m["payload"]["headers"]}
            yield {
                "id": m["id"],
                "thread_id": m["threadId"],
                "from": headers.get("From", ""),
                "subject": headers.get("Subject", ""),
                "snippet": m.get("snippet", ""),
                "from_me": address in headers.get("From", ""),
            }
    CURSOR.write_text(json.dumps({"history_id": resp.get("historyId", history_id)}))
