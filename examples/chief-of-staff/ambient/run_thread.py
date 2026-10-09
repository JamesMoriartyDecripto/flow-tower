"""One ambient run per email thread / calendar change / cron tick. Runs in parallel."""
import asyncio
import json

from claude_agent_sdk import ClaudeAgentOptions, query

from agent import send_query
from ambient.inbox_tools import INBOX_TOOLS, inbox_server
from ambient.workspace_tools import workspace_server

MAX_PARALLEL_RUNS = 4
_slots = asyncio.Semaphore(MAX_PARALLEL_RUNS)
MCP = {"inbox": inbox_server, "workspace": workspace_server}
READ_TOOLS = ["mcp__workspace__get_thread", "mcp__workspace__free_busy", "mcp__workspace__mark_read"]
SEND_TOOLS = ["mcp__workspace__send_email", "mcp__workspace__send_invite"]


async def triage(email: dict) -> dict:
    """Haiku, no tools, JSON only: ignore | notify | respond. Cheap enough for every email."""
    rules = open("prompts/triage.md", encoding="utf-8").read()
    learned = open("memory/preferences.md", encoding="utf-8").read()  # learned triage rules win
    options = ClaudeAgentOptions(model="claude-haiku-5-5", allowed_tools=[], max_turns=1,
                                 system_prompt=rules + "\n\n" + learned, setting_sources=[])
    text = ""
    async for msg in query(prompt=json.dumps(email), options=options):
        text = getattr(msg, "result", text) or text
    return json.loads(text)  # {"decision": "respond", "reason": "..."}


async def run_email_thread(address: str, history_id: str) -> None:
    from ambient.gmail_history import new_messages  # users.history.list since last historyId

    for email in new_messages(address, history_id):
        if email["from_me"]:  # the user already answered: close the thread, do nothing
            continue
        async with _slots:
            verdict = await triage(email)
            if verdict["decision"] == "ignore":
                continue  # no run, no card: the email stays where it is
            await send_query(
                f"/handle-email {verdict['decision']} {email['thread_id']}",
                output_style="executive",
                mcp_servers=MCP,
                extra_tools=INBOX_TOOLS + READ_TOOLS + SEND_TOOLS,
            )


async def run_calendar_change(channel_id: str) -> None:
    async with _slots:
        await send_query("/calendar-change " + channel_id, mcp_servers=MCP,
                         extra_tools=INBOX_TOOLS + READ_TOOLS)


async def run_daily_brief() -> None:
    """07:00 weekdays. Plan mode: read-only, the brief goes to the inbox as a notify card."""
    await send_query("/daily-brief", permission_mode="plan", output_style="executive",
                     mcp_servers=MCP, extra_tools=INBOX_TOOLS + READ_TOOLS)


async def run_sweep() -> None:
    """Every 10 minutes: catch pushes Pub/Sub dropped, and resume threads the user answered."""
    from ambient.gmail_history import last_history_id, primary_address

    await run_email_thread(primary_address(), last_history_id())


async def run_renew_watches() -> None:
    from ambient.oauth import renew_watches
    from ambient.workspace_tools import calendar, gmail

    renew_watches(gmail, calendar, "projects/cos-prod/topics/gmail-inbox", "cos-primary-calendar",
                  "https://cos-worker.example.com/push/calendar")
