"""One search subagent: a bounded tool loop with server-side web search and fetch.

Each subagent has its own context window and returns only compressed findings
plus artifact references to the lead.
"""
from anthropic import AsyncAnthropic

from config import EFFORT, LIMITS, MODELS, WEB_FETCH, WEB_SEARCH
from compress import compress
from prompt_templates import render

client = AsyncAnthropic()


async def run_searcher(run_id: str, task: str, max_tool_calls: int, mcp_tools: list[dict]) -> dict:
    system = render("searcher", task=task, max_tool_calls=max_tool_calls)
    tools = [
        {**WEB_SEARCH, "max_uses": max_tool_calls},
        {**WEB_FETCH, "max_uses": max_tool_calls},
        *mcp_tools,
    ]
    messages = [{"role": "user", "content": task}]
    for _ in range(LIMITS.max_react_tool_calls):
        response = await client.messages.create(
            model=MODELS["searcher"],
            max_tokens=16000,
            system=system,
            tools=tools,
            output_config={"effort": EFFORT["searcher"]},
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason == "pause_turn":
            continue  # long server-tool turn: resend to let it resume
        if response.stop_reason != "tool_use":
            break
        # Client-side (MCP proxy) tools would be executed here; server tools need no loop.
        messages.append({"role": "user", "content": await run_client_tools(run_id, response)})

    return {"task": task, "findings": await compress(task, messages)}


async def run_client_tools(run_id: str, response) -> list[dict]:
    from client_tools import execute  # MCP proxy + save_artifact; imported lazily

    blocks = [b for b in response.content if b.type == "tool_use"]
    return [await execute(run_id, block) for block in blocks]
