"""ADK purchasing concierge: discovers seller agents by agent card and delegates over A2A.

Condensed from the Google codelab (Apache 2.0). Pinned: google-adk 1.15.1, a2a-sdk 0.2.16.
"""
import os
import uuid
from pathlib import Path

import httpx
from a2a.client import A2ACardResolver, A2AClient
from a2a.types import MessageSendParams, SendMessageRequest, SendMessageSuccessResponse, Task
from google.adk import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.tool_context import ToolContext

PROMPT = Path(__file__).parent.parent.joinpath("prompts/concierge.md").read_text()
SELLER_URLS = [os.getenv("BURGER_SELLER_AGENT_URL"), os.getenv("PIZZA_SELLER_AGENT_URL")]


class PurchasingAgent:
    def __init__(self):
        self.clients: dict[str, A2AClient] = {}
        self.cards = {}
        self.httpx = httpx.AsyncClient(timeout=30)

    async def before_agent_callback(self, callback_context: CallbackContext):
        """Resolve /.well-known/agent.json once per process; unreachable sellers are skipped."""
        if self.cards:
            return
        for url in filter(None, SELLER_URLS):
            try:
                card = await A2ACardResolver(base_url=url, httpx_client=self.httpx).get_agent_card()
            except httpx.ConnectError:
                continue
            self.cards[card.name] = card
            self.clients[card.name] = A2AClient(self.httpx, card, url=card.url)

    def root_instruction(self, context: ReadonlyContext) -> str:
        agents = "\n".join(f"- {c.name}: {c.description}" for c in self.cards.values())
        active = context.state.get("active_agent", "None")
        return PROMPT.replace("{{agents}}", agents).replace("{{active_agent}}", active)

    async def send_task(self, agent_name: str, task: str, tool_context: ToolContext):
        """Sends a task to a remote seller agent over A2A (JSON-RPC message/send).

        Args:
            agent_name: Name of the seller agent, from its agent card.
            task: Everything the seller needs, including the user's confirmation if given.
        """
        if agent_name not in self.clients:
            raise ValueError(f"Agent {agent_name} not found")
        state = tool_context.state
        state["active_agent"] = agent_name
        state.setdefault("context_id", str(uuid.uuid4()))  # one A2A context per user session
        message = {
            "role": "user",
            "parts": [{"type": "text", "text": task}],
            "messageId": str(uuid.uuid4()),
            "contextId": state["context_id"],
        }
        request = SendMessageRequest(id=str(uuid.uuid4()), params=MessageSendParams(message=message))
        response = await self.clients[agent_name].send_message(request)
        if not isinstance(response.root, SendMessageSuccessResponse):
            return None
        result = response.root.result
        return result if isinstance(result, Task) else None

    def create_agent(self) -> Agent:
        return Agent(
            model="gemini-2.5-flash",
            name="purchasing_agent",
            instruction=self.root_instruction,
            before_agent_callback=self.before_agent_callback,
            description="Orchestrates purchase requests across remote seller agents.",
            tools=[self.send_task],
        )
