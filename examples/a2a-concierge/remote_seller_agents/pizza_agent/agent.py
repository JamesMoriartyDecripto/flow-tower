"""LangGraph pizza seller (condensed from the Google codelab, Apache 2.0)."""
import os
import uuid
from pathlib import Path

from langchain_core.tools import tool
from langchain_google_vertexai import ChatVertexAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

memory = MemorySaver()  # per-process: Cloud Run --min 1 keeps the conversation warm


class OrderItem(BaseModel):
    name: str
    quantity: int
    price: int


class Order(BaseModel):
    order_id: str
    status: str
    order_items: list[OrderItem]


@tool
def create_pizza_order(order_items: list[OrderItem]) -> str:
    """Creates a new pizza order with the given order items."""
    try:
        order = Order(order_id=str(uuid.uuid4()), status="created", order_items=order_items)
    except Exception as e:
        return f"Error creating order: {e}"
    return f"Order {order.model_dump()} has been created"


class PizzaSellerAgent:
    SYSTEM_INSTRUCTION = Path(__file__).parents[2].joinpath("prompts/pizza-seller.md").read_text()
    SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]

    def __init__(self):
        self.model = ChatVertexAI(
            model="gemini-2.5-flash-lite",
            location=os.getenv("GOOGLE_CLOUD_LOCATION"),
            project=os.getenv("GOOGLE_CLOUD_PROJECT"),
        )
        self.graph = create_react_agent(
            self.model,
            tools=[create_pizza_order],
            checkpointer=memory,
            prompt=self.SYSTEM_INSTRUCTION,
        )

    def invoke(self, query: str, session_id: str) -> str:
        """A2A contextId doubles as the LangGraph thread_id, so a follow-up keeps its history."""
        config = {"configurable": {"thread_id": session_id}}
        self.graph.invoke({"messages": [("user", query)]}, config)
        return self.graph.get_state(config).values["messages"][-1].content
