"""Backend of the Review Inbox app (user-facing). Lists open cards, records the user's answer,
then resumes the paused thread and feeds the answer to the reflection step."""
import json

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from agent import send_query
from ambient.reflect import feedback_event, reflect
from ambient.run_thread import INBOX_TOOLS, MCP, READ_TOOLS, SEND_TOOLS
from ambient.state import _db

app = FastAPI()


class Answer(BaseModel):
    action: str          # approve | edit | reject | respond | dismiss
    args: str = ""       # edited draft or free-text answer


@app.get("/inbox")
async def list_cards():
    with _db() as conn:
        rows = conn.execute("SELECT id, kind, thread_id, payload FROM inbox WHERE status = 'open'"
                            " ORDER BY rowid DESC").fetchall()
    return [{"id": r[0], "kind": r[1], "thread_id": r[2], **json.loads(r[3])} for r in rows]


@app.post("/inbox/{card_id}")
async def answer(card_id: str, body: Answer, tasks: BackgroundTasks):
    with _db() as conn:
        row = conn.execute("SELECT kind, thread_id, payload FROM inbox WHERE id = ?", (card_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        card = {"kind": row[0], "thread_id": row[1], **json.loads(row[2])}
        if body.action not in card["allowed"]:
            raise HTTPException(status_code=422, detail=f"{card['kind']} allows {card['allowed']}")
        status = "approved" if body.action in ("approve", "edit") else body.action
        conn.execute("UPDATE inbox SET status = ?, response = ? WHERE id = ?",
                     (status, body.args, card_id))

    if body.action != "dismiss":
        tasks.add_task(send_query,
                       f"/resume {card['thread_id']} {card_id} {body.action}: {body.args}",
                       continue_conversation=True, mcp_servers=MCP,
                       extra_tools=INBOX_TOOLS + READ_TOOLS + SEND_TOOLS)
    event = feedback_event(card, body.model_dump())
    if event:
        tasks.add_task(reflect, event)
    return {"status": status}
