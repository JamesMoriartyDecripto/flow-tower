"""AgentCore Browser session lifecycle: start with a TTL, hand control to a human, stop."""
import logging

import boto3
from bedrock_agentcore.tools.browser_client import BrowserClient

log = logging.getLogger("portal.session")

BROWSER_ID = "portal_browser-Xk2f9QeLpA"  # custom browser with S3 recording (config/browser.yaml)
REGION = "eu-central-1"
DEFAULT_TTL = 900       # 15 min, AgentCore default
MAX_TTL = 28800         # 8 h, AgentCore maximum


def start(work_item_id: str, batch: bool = False) -> BrowserClient:
    """One isolated microVM per work item; it is destroyed when the TTL expires."""
    ttl = MAX_TTL if batch else DEFAULT_TTL
    client = BrowserClient(region=REGION)
    client.start(
        identifier=BROWSER_ID,
        name=f"wi-{work_item_id}",
        session_timeout_seconds=ttl,
        viewport={"width": 1456, "height": 819},
    )
    log.info("session %s started ttl=%ss", client.session_id, ttl)
    return client


def live_view_url(client: BrowserClient) -> str:
    """Endpoint the ops console embeds so an operator can watch the run."""
    dp = boto3.client("bedrock-agentcore", region_name=REGION)
    info = dp.get_browser_session(browserIdentifier=BROWSER_ID, sessionId=client.session_id)
    return info["streams"]["liveViewStream"]["streamEndpoint"]


def _automation(client: BrowserClient, status: str) -> None:
    dp = boto3.client("bedrock-agentcore", region_name=REGION)
    dp.update_browser_stream(
        browserIdentifier=BROWSER_ID,
        sessionId=client.session_id,
        streamUpdate={"automationStreamUpdate": {"streamStatus": status}},
    )


def hand_to_human(client: BrowserClient, reason: str) -> None:
    """Disable the automation stream: the agent is locked out while the operator types
    (MFA codes, odd pop-ups). Recording keeps running, so the takeover is audited."""
    _automation(client, "DISABLED")
    log.warning("takeover requested session=%s reason=%s", client.session_id, reason)


def resume_agent(client: BrowserClient) -> None:
    _automation(client, "ENABLED")
    log.info("automation re-enabled session=%s", client.session_id)


def stop(client: BrowserClient) -> None:
    """Always called in a finally block; an idle portal login also costs a licence seat."""
    client.stop()
