"""CrewAI burger seller (condensed from the Google codelab, Apache 2.0)."""
import uuid
from pathlib import Path

from crewai import LLM, Agent, Crew, Process, Task
from crewai.tools import tool
from pydantic import BaseModel

TASK_PROMPT = Path(__file__).parents[2].joinpath("prompts/burger-seller.md").read_text()


class OrderItem(BaseModel):
    name: str
    quantity: int
    price: int


class Order(BaseModel):
    order_id: str
    status: str
    order_items: list[OrderItem]


@tool("create_order")
def create_burger_order(order_items: list[OrderItem]) -> str:
    """Creates a new burger order with the given order items."""
    try:
        order = Order(order_id=str(uuid.uuid4()), status="created", order_items=order_items)
    except Exception as e:  # validation errors go back to the model as text
        return f"Error creating order: {e}"
    return f"Order {order.model_dump()} has been created"


class BurgerSellerAgent:
    SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]

    def invoke(self, query: str, session_id: str) -> str:
        # LiteLLM route; project and region come from the Cloud Run service account (ADC).
        model = LLM(model="vertex_ai/gemini-2.5-flash-lite")
        seller = Agent(
            role="Burger Seller Agent",
            goal="Help user to understand what is available on burger menu and price "
                 "also handle order creation.",
            backstory="You are an expert and helpful burger seller agent.",
            verbose=False,
            allow_delegation=False,
            tools=[create_burger_order],
            llm=model,
        )
        task = Task(
            description=TASK_PROMPT.replace("{{query}}", query),
            agent=seller,
            expected_output="Items, price breakdown, total, and either a confirmation question or the order ID.",
        )
        crew = Crew(tasks=[task], agents=[seller], process=Process.sequential, verbose=False)
        return str(crew.kickoff())
