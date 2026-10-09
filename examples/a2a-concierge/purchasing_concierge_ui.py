"""Gradio chat UI that talks to the deployed concierge on Agent Engine."""
import os

import gradio as gr
from dotenv import load_dotenv
from vertexai import agent_engines

load_dotenv()

USER_ID = "default_user"  # codelab simplification: every visitor shares one user
REMOTE_APP = agent_engines.get(os.getenv("AGENT_ENGINE_RESOURCE_NAME"))
SESSION_ID = REMOTE_APP.create_session(user_id=USER_ID)["id"]


def get_response_from_agent(message, history):
    responses = []
    for event in REMOTE_APP.stream_query(user_id=USER_ID, session_id=SESSION_ID, message=message):
        for part in event.get("content", {}).get("parts", []):
            if "function_call" in part:
                title, body = "Tool Call", str(part["function_call"])
            elif "function_response" in part:
                title, body = "Tool Response", str(part["function_response"])
            elif "text" in part:
                responses.append(gr.ChatMessage(role="assistant", content=part["text"]))
                continue
            else:
                continue
            responses.append(gr.ChatMessage(role="assistant", content=f"```\n{body}\n```",
                                            metadata={"title": title}))
    yield responses or [gr.ChatMessage(role="assistant", content="No response from agent")]


if __name__ == "__main__":
    demo = gr.ChatInterface(get_response_from_agent, title="Purchasing Concierge", type="messages")
    demo.launch(server_name="0.0.0.0", server_port=8080)
