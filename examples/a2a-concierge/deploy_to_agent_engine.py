"""Deploy the concierge to Vertex AI Agent Engine (as in the codelab)."""
import os

import vertexai
from dotenv import load_dotenv
from vertexai import agent_engines
from vertexai.preview import reasoning_engines

from purchasing_concierge.agent import root_agent

load_dotenv()

vertexai.init(
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location=os.getenv("GOOGLE_CLOUD_LOCATION"),           # us-central1
    staging_bucket=os.getenv("STAGING_BUCKET"),            # gs://purchasing-concierge-<project>
)

adk_app = reasoning_engines.AdkApp(agent=root_agent)

remote_app = agent_engines.create(
    agent_engine=adk_app,
    display_name="purchasing-concierge",
    requirements=[
        "google-cloud-aiplatform[agent_engines]",
        "google-adk==1.15.1",
        "a2a-sdk==0.2.16",
    ],
    extra_packages=["./purchasing_concierge", "./prompts"],
    env_vars={
        "GOOGLE_GENAI_USE_VERTEXAI": "TRUE",
        "BURGER_SELLER_AGENT_URL": os.getenv("BURGER_SELLER_AGENT_URL"),
        "PIZZA_SELLER_AGENT_URL": os.getenv("PIZZA_SELLER_AGENT_URL"),
    },
)

# Put this in AGENT_ENGINE_RESOURCE_NAME for the Gradio UI.
print(f"Deployed remote app resource: {remote_app.resource_name}")
