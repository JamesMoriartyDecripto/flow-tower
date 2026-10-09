"""Fresh-context verification and the guarded submit, on the same browser session."""
import json
from pathlib import Path

from anthropic import AnthropicBedrock
from playwright.sync_api import sync_playwright

import computer_loop
import submit_guard
from session import REGION

VERIFIER = "eu.anthropic.claude-opus-5-5"
PROMPT = Path(__file__).parent.parent.joinpath("prompts/verifier.md").read_text()


def verdict(session_id: str, item: dict, request_type: str) -> dict:
    """Opus sees only the request, the field map and a new screenshot, never the worker's chat."""
    shot = computer_loop._invoke(session_id, {"screenshot": {"format": "PNG"}})
    fields = submit_guard.FIELD_MAP[request_type]["fields"]
    prompt = PROMPT.replace("{{work_item}}", json.dumps(item)).replace("{{fields}}", json.dumps(fields))
    msg = AnthropicBedrock(aws_region=REGION).messages.create(
        model=VERIFIER, max_tokens=1500,
        messages=[{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": shot["data"]}},
        ]}],
    )
    text = msg.content[0].text
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def verify_and_submit(client, item: dict, request_type: str, entered: dict) -> dict:
    v = verdict(client.session_id, item, request_type)
    try:
        submit_guard.check(request_type, entered, v)
    except submit_guard.Blocked as exc:
        return {"status": "needs_review", "reason": str(exc), "verdict": v}

    ws_url, headers = client.generate_ws_headers()
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url, headers=headers)
        page = browser.contexts[0].pages[0]
        ref = submit_guard.submit(page, request_type, entered, v)
        browser.close()
    return {"status": "submitted", "confirmation": ref}
