"""ADK entry point: `root_agent` is what AdkApp and `adk web` load."""
from .purchasing_agent import PurchasingAgent

root_agent = PurchasingAgent().create_agent()
