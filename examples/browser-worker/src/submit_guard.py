"""Submit guard: only this code may click Submit, and only after an independent check.

The worker model never gets a Submit action. It calls `ready_to_submit`; the guard
re-reads the page with a fresh screenshot, asks the verifier model, compares the
verdict with the field map and only then clicks the button by DOM selector.
"""
import json
import logging
from pathlib import Path

import yaml

log = logging.getLogger("portal.guard")
FIELD_MAP = yaml.safe_load(Path(__file__).parent.parent.joinpath("config/field-map.yaml").read_text())


class Blocked(Exception):
    """Raised when a submit must go to human review instead."""


def required_fields(request_type: str) -> list[str]:
    return [f["name"] for f in FIELD_MAP[request_type]["fields"] if f.get("verify")]


def check(request_type: str, entered: dict, verdict: dict) -> None:
    """Every verify:true field must be both reported by the worker and confirmed on screen."""
    need = set(required_fields(request_type))
    missing = need - set(entered)
    seen_ok = {f["name"] for f in verdict.get("fields", []) if f.get("ok")}
    unverified = need - seen_ok

    if verdict.get("verdict") != "pass":
        raise Blocked(f"verifier: {verdict.get('reason') or 'fail'}")
    if missing:
        raise Blocked(f"worker did not fill: {sorted(missing)}")
    if unverified:
        raise Blocked(f"not confirmed on screenshot: {sorted(unverified)}")
    if verdict.get("page_warnings"):
        raise Blocked(f"page warnings: {verdict['page_warnings']}")
    log.info("guard pass type=%s fields=%s", request_type, sorted(need))


def submit(page, request_type: str, entered: dict, verdict: dict) -> str:
    """Click Submit with Playwright and return the portal's confirmation number."""
    check(request_type, entered, verdict)
    page.click("button#submit-endorsement")
    page.wait_for_selector(".confirmation-number", timeout=30_000)
    ref = page.inner_text(".confirmation-number").strip()
    log.info("submitted ref=%s entered=%s", ref, json.dumps(sorted(entered)))
    return ref
