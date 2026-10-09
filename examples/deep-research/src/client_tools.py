"""Client-side tools for searchers: MCP proxy calls and save_artifact.

Web search and fetch are Anthropic server tools and never reach this file.
MCP servers (Google Drive, Confluence) are reached through an allowlist:
a searcher can only call servers named in config.LIMITS.allowed_mcp.
"""
import json

from mcp import Client

from config import LIMITS
from plan_store import save_artifact

with open("config/mcp.json") as fh:
    SERVERS = json.load(fh)["mcpServers"]


async def call_mcp(server: str, tool: str, args: dict) -> str:
    if server not in LIMITS.allowed_mcp:
        return f"error: MCP server '{server}' is not allowed for searchers"
    async with Client(SERVERS[server]["url"]) as client:
        result = await client.call_tool(tool, args)
        return "\n".join(c.text for c in result.content if c.type == "text")


async def execute(run_id: str, block) -> dict:
    """Run one tool_use block; errors go back to the model as tool_result text."""
    try:
        if block.name == "save_artifact":
            content = save_artifact(run_id, block.input["url"], block.input["text"])
        elif block.name.startswith("mcp__"):
            _, server, tool = block.name.split("__", 2)
            content = await call_mcp(server, tool, block.input)
        else:
            content, is_error = f"unknown tool {block.name}", True
            return {"type": "tool_result", "tool_use_id": block.id, "content": content, "is_error": is_error}
        return {"type": "tool_result", "tool_use_id": block.id, "content": content}
    except Exception as err:  # the loop continues; the model sees the failure
        return {"type": "tool_result", "tool_use_id": block.id, "content": str(err), "is_error": True}
