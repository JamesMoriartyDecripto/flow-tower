"""ChatKit server (upstream: server.py). One Runner.run_streamed per user message,
resuming at the last active agent. Abridged: event recording and SSE broadcast are summarized."""
import asyncio
from dataclasses import dataclass, field
from typing import Any

from agents import InputGuardrailTripwireTriggered, Runner
from agents.exceptions import MaxTurnsExceeded
from chatkit.agents import stream_agent_response
from chatkit.server import ChatKitServer

from airline.agents import (
    booking_cancellation_agent, faq_agent, flight_information_agent,
    refunds_compensation_agent, seat_special_services_agent, triage_agent,
)
from airline.context import (
    AirlineAgentChatContext, AirlineAgentContext, create_initial_context, public_context,
)
from memory_store import MemoryStore

AGENTS = {a.name: a for a in (triage_agent, faq_agent, seat_special_services_agent,
                              flight_information_agent, booking_cancellation_agent,
                              refunds_compensation_agent)}
REFUSAL = "Sorry, I can only answer questions related to airline travel."


@dataclass
class ConversationState:
    input_items: list[Any] = field(default_factory=list)
    context: AirlineAgentContext = field(default_factory=create_initial_context)
    current_agent_name: str = triage_agent.name   # decentralized: the last agent keeps the floor
    events: list[dict] = field(default_factory=list)      # message / handoff / tool_call / context_update
    guardrails: list[dict] = field(default_factory=list)  # last pass/fail per guardrail


class AirlineServer(ChatKitServer[dict[str, Any]]):
    def __init__(self) -> None:
        self.store = MemoryStore()
        super().__init__(self.store)
        self._state: dict[str, ConversationState] = {}
        self._listeners: dict[str, list[asyncio.Queue]] = {}

    async def respond(self, thread, input_user_message, context):
        state = self._state.setdefault(thread.id, ConversationState())
        text = "".join(getattr(p, "text", "") for p in input_user_message.content)
        state.input_items.append({"role": "user", "content": text})
        chat_ctx = AirlineAgentChatContext(thread=thread, store=self.store,
                                           request_context=context, state=state.context)
        try:
            result = Runner.run_streamed(AGENTS[state.current_agent_name], state.input_items,
                                         context=chat_ctx)
            async for event in stream_agent_response(chat_ctx, result):
                yield event  # upstream also records handoffs/tool calls and broadcasts deltas
        except MaxTurnsExceeded:
            return
        except InputGuardrailTripwireTriggered as exc:
            info = exc.guardrail_result.output.output_info
            state.guardrails = [{"name": exc.guardrail_result.guardrail.get_name(),
                                 "passed": False, "reasoning": getattr(info, "reasoning", "")}]
            state.input_items.append({"role": "assistant", "content": REFUSAL})
            return  # upstream yields a ThreadItemDoneEvent carrying REFUSAL here
        state.input_items = result.to_input_list()
        state.current_agent_name = result.last_agent.name

    async def snapshot(self, thread_id: str, context: dict[str, Any]) -> dict[str, Any]:
        state = self._state.setdefault(thread_id, ConversationState())
        return {"thread_id": thread_id, "current_agent": state.current_agent_name,
                "context": public_context(state.context), "events": state.events,
                "guardrails": state.guardrails}

    def register_listener(self, thread_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.setdefault(thread_id, []).append(queue)
        return queue

    def unregister_listener(self, thread_id: str, queue: asyncio.Queue) -> None:
        if queue in self._listeners.get(thread_id, []):
            self._listeners[thread_id].remove(queue)
