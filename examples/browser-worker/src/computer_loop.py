"""Claude computer use on Bedrock, executed with AgentCore InvokeBrowser (OS-level actions)."""
import base64

import boto3
from anthropic import AnthropicBedrock

from session import BROWSER_ID, REGION

MODEL = "eu.anthropic.claude-sonnet-5-5"  # Sonnet 5.5 inference profile in eu-central-1
BETA = "computer-use-2025-11-24"          # Bedrock still takes computer_20251124 for 5.5 models
W, H = 1456, 819
TOOLS = [
    {"type": "computer_20251124", "name": "computer", "display_width_px": W,
     "display_height_px": H, "enable_zoom": True},
    {"name": "request_takeover", "description": "Login page, MFA or a pop-up you cannot handle.",
     "input_schema": {"type": "object", "properties": {"reason": {"type": "string"}}}},
    {"name": "ready_to_submit", "description": "All fields filled. Report what you entered.",
     "input_schema": {"type": "object", "properties": {"entered": {"type": "object"}}}},
    {"name": "report", "description": "Stop with exception, stuck or mismatch.",
     "input_schema": {"type": "object", "properties": {
         "status": {"enum": ["exception", "stuck", "mismatch"]}, "detail": {"type": "string"}}}},
]
STOP_TOOLS = {"request_takeover", "ready_to_submit", "report"}
dp = boto3.client("bedrock-agentcore", region_name=REGION)


def _invoke(session_id: str, action: dict) -> dict:
    res = dp.invoke_browser(browserIdentifier=BROWSER_ID, sessionId=session_id, action=action)
    return next(iter(res["result"].values()))


def execute(session_id: str, inp: dict) -> list:
    """Map one computer-use action to one InvokeBrowser call; always answer with a screenshot."""
    a, xy = inp["action"], inp.get("coordinate", [0, 0])
    if a in ("left_click", "double_click", "right_click"):
        button = "RIGHT" if a == "right_click" else "LEFT"
        _invoke(session_id, {"mouseClick": {"x": xy[0], "y": xy[1], "button": button,
                                            "clickCount": 2 if a == "double_click" else 1}})
    elif a == "type":
        _invoke(session_id, {"keyType": {"text": inp["text"]}})  # ASCII only on InvokeBrowser
    elif a == "key":
        keys = inp["text"].lower().split("+")
        action = {"keyShortcut": {"keys": keys}} if len(keys) > 1 else {"keyPress": {"key": keys[0]}}
        _invoke(session_id, action)
    elif a == "scroll":
        dy = 300 * inp.get("scroll_amount", 3) * (-1 if inp.get("scroll_direction") == "down" else 1)
        _invoke(session_id, {"mouseScroll": {"x": xy[0], "y": xy[1], "deltaY": dy}})
    shot = _invoke(session_id, {"screenshot": {"format": "PNG"}})  # zoom is cropped client-side
    return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": shot["data"]}}]


def run(session_id: str, system: str, task: str, max_steps: int = 60) -> dict:
    client = AnthropicBedrock(aws_region=REGION)
    messages = [{"role": "user", "content": task}]
    for step in range(max_steps):
        msg = client.beta.messages.create(model=MODEL, max_tokens=4096, system=system,
                                          tools=TOOLS, messages=messages, betas=[BETA])
        messages.append({"role": "assistant", "content": msg.content})
        results = []
        for block in msg.content:
            if block.type != "tool_use":
                continue
            if block.name in STOP_TOOLS:
                return {"tool": block.name, "input": block.input, "steps": step + 1}
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": execute(session_id, block.input)})
        if not results:
            return {"tool": "report", "input": {"status": "stuck", "detail": "no action"}, "steps": step + 1}
        messages.append({"role": "user", "content": results})
    return {"tool": "report", "input": {"status": "stuck", "detail": "max_steps"}, "steps": max_steps}
