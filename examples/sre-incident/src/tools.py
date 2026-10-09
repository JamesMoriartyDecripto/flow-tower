"""Custom tools: declared on the agents, executed by this application (never in the sandbox)."""
from os import environ

import httpx


def _tool(name: str, description: str, props: dict, required: list[str]) -> dict:
    return {"type": "custom", "name": name, "description": description,
            "input_schema": {"type": "object", "properties": props, "required": required}}


S, I = {"type": "string"}, {"type": "integer"}

CUSTOM_TOOLS_INVESTIGATE = [
    _tool("get_logs", "Search Datadog logs for a service.", {"service": S, "query": S, "window": S}, ["service"]),
    _tool("get_alerts", "List alerts grouped into a PagerDuty incident.", {"incident_id": S}, ["incident_id"]),
    _tool("get_recent_deployments", "Deploys of a service in a time window.", {"service": S, "since": S}, ["service"]),
]
CUSTOM_TOOLS_REMEDIATE = [
    _tool("open_pull_request", "Open a PR against the infra repo with the fix.",
          {"title": S, "body": S, "diff": S}, ["title", "body", "diff"]),
    _tool("request_approval", "Ask the on-call human to approve before merging.", {"summary": S}, ["summary"]),
    _tool("merge_pull_request", "Merge an approved PR.", {"pr_number": I}, ["pr_number"]),
]

DD = "https://api.datadoghq.com/api/v2/logs/events/search"
PD = "https://api.pagerduty.com"
GH = "https://api.github.com/repos/example-org/infra"


def get_logs(service: str, query: str = "", window: str = "30m") -> dict:
    headers = {"DD-API-KEY": environ["DD_API_KEY"], "DD-APPLICATION-KEY": environ["DD_APP_KEY"]}
    body = {"filter": {"query": f"service:{service} {query}".strip(), "from": f"now-{window}", "to": "now"},
            "page": {"limit": 200}, "sort": "-timestamp"}
    events = httpx.post(DD, json=body, headers=headers, timeout=20).json().get("data", [])
    return {"lines": [e["attributes"].get("message", "") for e in events]}


def get_alerts(incident_id: str) -> dict:
    headers = {"Authorization": f"Token token={environ['PAGERDUTY_TOKEN']}"}
    r = httpx.get(f"{PD}/incidents/{incident_id}/alerts", headers=headers, timeout=20)
    return {"alerts": [{"id": a["id"], "summary": a["summary"], "created_at": a["created_at"]}
                       for a in r.json()["alerts"]]}


def get_recent_deployments(service: str, since: str = "2h") -> dict:
    r = httpx.get(f"{GH}/deployments", params={"environment": f"prod-{service}", "per_page": 10},
                  headers={"Authorization": f"Bearer {environ['GITHUB_TOKEN']}"}, timeout=20)
    return {"since": since, "deployments": [{"sha": d["sha"][:7], "ref": d["ref"], "created_at": d["created_at"]}
                                            for d in r.json()]}


def open_pull_request(title: str, body: str, diff: str) -> dict:
    from github_pr import open_pr  # pushes a branch with `git apply`, then POST /pulls
    return open_pr(title, body, diff)


def merge_pull_request(pr_number: int) -> dict:
    r = httpx.put(f"{GH}/pulls/{pr_number}/merge", json={"merge_method": "squash"},
                  headers={"Authorization": f"Bearer {environ['GITHUB_TOKEN']}"}, timeout=20)
    return {"merged": r.json().get("merged", False)}


HANDLERS = {f.__name__: f for f in (get_logs, get_alerts, get_recent_deployments,
                                    open_pull_request, merge_pull_request)}
