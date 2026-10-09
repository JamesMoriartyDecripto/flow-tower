"""Push receiver: Gmail users.watch -> Pub/Sub push, and Calendar events.watch channels.

Acks fast (Pub/Sub retries anything slower than the ack deadline), dedupes, then queues
one ambient run per email thread or calendar change. Runs are concurrent across threads.
"""
import base64
import hashlib
import json

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

from ambient.run_thread import run_calendar_change, run_email_thread
from ambient.state import already_seen, verify_pubsub_jwt

app = FastAPI()


@app.post("/push/gmail")
async def gmail_push(request: Request, tasks: BackgroundTasks, authorization: str = Header("")):
    if not verify_pubsub_jwt(authorization):  # OIDC token minted by the push subscription
        raise HTTPException(status_code=401)
    envelope = await request.json()
    data = json.loads(base64.b64decode(envelope["message"]["data"]))
    # data = {"emailAddress": "...", "historyId": "123456"}; fetch changes since last historyId
    if already_seen("gmail", data["historyId"]):
        return {"status": "duplicate"}
    tasks.add_task(run_email_thread, data["emailAddress"], data["historyId"])
    return {"status": "queued"}


@app.post("/push/calendar")
async def calendar_push(
    tasks: BackgroundTasks,
    x_goog_channel_id: str = Header(...),
    x_goog_resource_state: str = Header(...),
    x_goog_message_number: str = Header("0"),
):
    if x_goog_resource_state == "sync":  # handshake sent when the channel is created
        return {"status": "sync"}
    key = hashlib.sha1(f"{x_goog_channel_id}:{x_goog_message_number}".encode()).hexdigest()
    if already_seen("calendar", key):
        return {"status": "duplicate"}
    tasks.add_task(run_calendar_change, x_goog_channel_id)
    return {"status": "queued"}


@app.post("/cron/{job}")
async def cron(job: str, tasks: BackgroundTasks):
    """Cloud Scheduler targets (ambient/schedules.yaml)."""
    from ambient.run_thread import run_daily_brief, run_renew_watches, run_sweep

    jobs = {"daily-brief": run_daily_brief, "sweep": run_sweep, "renew-watches": run_renew_watches}
    if job not in jobs:
        raise HTTPException(status_code=404)
    tasks.add_task(jobs[job])
    return {"status": "queued"}
