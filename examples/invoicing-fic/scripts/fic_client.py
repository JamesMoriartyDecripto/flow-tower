"""Fatture in Cloud API v2 client setup: OAuth refresh, SDK configuration, polite retries.

Official SDK: https://github.com/fattureincloud/fattureincloud-python-sdk (package
fattureincloud-python-sdk, import fattureincloud_python_sdk). Token endpoint and lifetimes from
developers.fattureincloud.it/docs/authentication/code-flow/vanilla-code/: access token 24h,
refresh token 1 year from the last refresh, a new refresh_token is returned on every refresh.
Limits (docs/basics/limits-and-quotas): 300 req / 5 min per company (429), 1,000 req / h and
40,000 req / month per company-app pair (403). Both carry Retry-After.
"""
import random
import time
from os import environ

import requests
import fattureincloud_python_sdk
from fattureincloud_python_sdk.rest import ApiException

API_HOST = "https://api-v2.fattureincloud.it"
TOKEN_URL = f"{API_HOST}/oauth/token"


def refresh_access_token(secrets) -> str:
    """secrets: a small wrapper over Secret Manager (get/put by name). Never log tokens."""
    resp = requests.post(TOKEN_URL, timeout=20, json={
        "grant_type": "refresh_token",
        "client_id": secrets.get("fic-oauth-client-id"),
        "client_secret": secrets.get("fic-oauth-client-secret"),
        "refresh_token": secrets.get("fic-oauth-refresh-token"),
    })
    resp.raise_for_status()
    body = resp.json()
    secrets.put("fic-oauth-refresh-token", body["refresh_token"])  # rotate: keep the newest
    secrets.put("fic-oauth-access-token", body["access_token"], ttl_seconds=body["expires_in"] - 300)
    return body["access_token"]


def api_client(access_token: str) -> fattureincloud_python_sdk.ApiClient:
    configuration = fattureincloud_python_sdk.Configuration(host=API_HOST)
    configuration.access_token = access_token
    return fattureincloud_python_sdk.ApiClient(configuration)


def company_id() -> int:
    return int(environ["FIC_COMPANY_ID"])


def call(fn, *args, max_retries: int = 5, **kwargs):
    """Run one SDK call. 429 (5-minute window) and 403 with Retry-After (hourly or monthly
    quota) wait as told; 5xx back off exponentially with jitter. Other errors raise at once."""
    for attempt in range(max_retries + 1):
        try:
            return fn(*args, **kwargs)
        except ApiException as exc:
            retry_after = (exc.headers or {}).get("Retry-After")
            quota_hit = exc.status == 429 or (exc.status == 403 and retry_after)
            if attempt == max_retries or not (quota_hit or exc.status >= 500):
                raise
            if retry_after and int(retry_after) > 900:
                raise  # monthly quota or a long hourly wait: park the job, page finance ops
            delay = int(retry_after) if retry_after else min(300, 2 ** attempt) + random.random()
            time.sleep(delay)


def find_client_by_vat(client, vat_number: str):
    """ClientsApi.list_clients with a q filter (docs/basics/filter-results/queries)."""
    api = fattureincloud_python_sdk.ClientsApi(client)
    res = call(api.list_clients, company_id(), q=f"vat_number = '{vat_number}'",
               fields="id,name,vat_number,tax_code,ei_code,certified_email,e_invoice")
    return res.data[0] if res.data else None


def upsert_client(client, entity: dict):
    """create_client / modify_client with the {"data": {...}} request shape used by the SDK."""
    api = fattureincloud_python_sdk.ClientsApi(client)
    existing = find_client_by_vat(client, entity["vat_number"]) if entity.get("vat_number") else None
    if existing:
        return call(api.modify_client, company_id(), existing.id, modify_client_request={"data": entity}).data
    return call(api.create_client, company_id(), create_client_request={"data": entity}).data
