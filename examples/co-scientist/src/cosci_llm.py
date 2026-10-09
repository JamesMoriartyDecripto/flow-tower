"""Thin Gemini wrapper shared by every agent.

The paper's system runs on Gemini 2.0 and states the framework is model-agnostic;
the model id is configuration, not code. Grounding with Google Search is turned
on per call for agents that read literature (generation, full review, evolution).
"""
import json
import os

from google import genai
from google.genai import types

MODEL = os.environ.get("COSCI_MODEL", "gemini-2.0-flash")
EMBED_MODEL = "gemini-embedding-001"

client = genai.Client()  # Vertex AI or Gemini API, picked up from the environment
SEARCH = types.Tool(google_search=types.GoogleSearch())


async def ask(prompt: str, *, search: bool = False, as_json: bool = True) -> dict | str:
    config = types.GenerateContentConfig(
        tools=[SEARCH] if search else None,
        # JSON mode cannot be combined with the search tool, so parse text then.
        response_mime_type="application/json" if as_json and not search else None,
    )
    response = await client.aio.models.generate_content(model=MODEL, contents=prompt, config=config)
    if not as_json:
        return response.text
    text = response.text.strip().removeprefix("```json").removesuffix("```")
    return json.loads(text)


async def embed(texts: list[str]) -> list[list[float]]:
    response = await client.aio.models.embed_content(model=EMBED_MODEL, contents=texts)
    return [e.values for e in response.embeddings]
