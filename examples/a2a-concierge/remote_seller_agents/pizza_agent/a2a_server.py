"""A2A server for the pizza seller: agent card + JSON-RPC on Cloud Run (port 8080).

The codelab ships this as __main__.py and starts it with `uv run .`.
"""
import os

import uvicorn
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, Part, TextPart, UnsupportedOperationError
from a2a.utils import completed_task, new_artifact
from a2a.utils.errors import ServerError

from agent import PizzaSellerAgent


class PizzaSellerAgentExecutor(AgentExecutor):
    def __init__(self):
        self.agent = PizzaSellerAgent()

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        try:
            result = self.agent.invoke(context.get_user_input(), context.context_id)
        except Exception as e:
            raise ServerError(error=ValueError(f"Error invoking agent: {e}")) from e
        parts = [Part(root=TextPart(text=str(result)))]
        await event_queue.enqueue_event(completed_task(
            context.task_id, context.context_id,
            [new_artifact(parts, f"pizza_{context.task_id}")], [context.message]))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise ServerError(error=UnsupportedOperationError())


def main(host: str = "0.0.0.0", port: int = 8080) -> None:
    card = AgentCard(
        name="pizza_seller_agent",
        description="Helps with creating pizza orders",
        url=os.getenv("HOST_OVERRIDE") or f"http://{host}:{port}/",
        version="1.0.0",
        defaultInputModes=PizzaSellerAgent.SUPPORTED_CONTENT_TYPES,
        defaultOutputModes=PizzaSellerAgent.SUPPORTED_CONTENT_TYPES,
        capabilities=AgentCapabilities(streaming=True),
        skills=[AgentSkill(
            id="create_pizza_order",
            name="Pizza Order Creation Tool",
            description="Helps with creating pizza orders",
            tags=["pizza order creation"],
            examples=["I want to order 2 pepperoni pizzas"],
        )],
    )
    handler = DefaultRequestHandler(agent_executor=PizzaSellerAgentExecutor(), task_store=InMemoryTaskStore())
    uvicorn.run(A2AStarletteApplication(agent_card=card, http_handler=handler).build(), host=host, port=port)


if __name__ == "__main__":
    main()
