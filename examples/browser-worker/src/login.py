"""Deterministic login over CDP. The model never sees the portal password."""
import json
import logging

import boto3
from playwright.sync_api import sync_playwright

from session import REGION

log = logging.getLogger("portal.login")

PORTAL = "https://agents.legacy-insurer.example.com"
SECRET_NAME = "portal/service-user-ops-bot"


class MfaRequired(Exception):
    """The portal asked for an OTP: a human finishes the login in Live View."""


def _credentials() -> dict:
    sm = boto3.client("secretsmanager", region_name=REGION)
    return json.loads(sm.get_secret_value(SecretId=SECRET_NAME)["SecretString"])


def login(client) -> None:
    ws_url, headers = client.generate_ws_headers()
    creds = _credentials()
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url, headers=headers)
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.pages[0] if context.pages else context.new_page()

        page.goto(f"{PORTAL}/login", wait_until="domcontentloaded")
        page.fill("#username", creds["username"])
        page.fill("#password", creds["password"])
        page.click("button[type=submit]")
        page.wait_for_load_state("networkidle")

        if page.locator("#otp-code").count() > 0:
            raise MfaRequired("portal requested a one-time code")
        if page.locator("text=Policy Search").count() == 0:
            raise RuntimeError(f"login did not reach the dashboard: {page.url}")
        log.info("logged in as %s", creds["username"])
        # Disconnect without closing: the session (and the login cookie) stays alive
        # for the computer-use loop on the same microVM.
        browser.close()
