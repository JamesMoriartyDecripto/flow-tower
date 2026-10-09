"""Chief of Staff agent (after the Claude Agent SDK cookbook, notebook 01).

Interactive entry point. The ambient worker (ambient/run_thread.py) calls the same
send_query() with the inbox and workspace MCP servers attached.
"""
import json
import os
from typing import Any, Literal

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

HERE = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT = open(os.path.join(HERE, "prompts", "chief-of-staff.md"), encoding="utf-8").read()


async def send_query(
    prompt: str,
    continue_conversation: bool = False,
    permission_mode: Literal["default", "plan", "acceptEdits"] = "default",
    output_style: str | None = None,
    mcp_servers: dict[str, Any] | None = None,
    extra_tools: list[str] | None = None,
) -> tuple[str | None, list]:
    """prompt may be a slash command (/budget-impact ...). plan = think only, no side effects."""
    options = ClaudeAgentOptions(
        model="claude-opus-5-5",
        allowed_tools=["Task", "Read", "Write", "Edit", "Bash", "WebSearch", *(extra_tools or [])],
        continue_conversation=continue_conversation,
        system_prompt=SYSTEM_PROMPT,
        permission_mode=permission_mode,
        cwd=HERE,
        settings=json.dumps({"outputStyle": output_style}) if output_style else None,
        # "project" loads CLAUDE.md, .claude/agents, .claude/commands, output styles and the
        # hooks in .claude/settings.json (the cookbook keeps hooks in settings.local.json and
        # adds "local"; shared hooks belong in the committed project file).
        setting_sources=["project"],
        mcp_servers=mcp_servers or {},
        max_turns=40,
    )
    result, messages = None, []
    async with ClaudeSDKClient(options=options) as agent:
        await agent.query(prompt=prompt)
        async for msg in agent.receive_response():
            messages.append(msg)
            if hasattr(msg, "result"):
                result = msg.result
    return result, messages


async def plan_then_execute(prompt: str) -> str | None:
    """Plan mode first; the plan goes to plans/ and to the review inbox before any action."""
    plan, _ = await send_query(prompt + "\nWrite the plan inside <plan></plan> tags.",
                               permission_mode="plan")
    return plan  # ambient/inbox_tools.request_review() queues it; execution resumes on approve
