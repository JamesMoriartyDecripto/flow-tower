"""open_pull_request backend: apply the agent's unified diff on a fresh branch and open a PR.

argv-only subprocess calls (no shell) so a crafted diff cannot inject commands.
"""
import subprocess
from os import environ
from pathlib import Path

import httpx

REPO = Path(environ.get("INFRA_CHECKOUT", "/srv/infra"))
API = "https://api.github.com/repos/example-org/infra"


def _git(*args: str, stdin: str | None = None) -> None:
    subprocess.run(["git", "-C", str(REPO), *args], input=stdin, text=True, check=True)


def open_pr(title: str, body: str, diff: str) -> dict:
    branch = "incident/" + "".join(c if c.isalnum() else "-" for c in title.lower())[:48]
    _git("fetch", "origin", "main")
    _git("switch", "-C", branch, "origin/main")
    _git("apply", "--check", "-", stdin=diff)   # reject diffs that do not apply cleanly
    _git("apply", "-", stdin=diff)
    _git("commit", "-am", title)
    _git("push", "-u", "origin", branch, "--force-with-lease")
    r = httpx.post(f"{API}/pulls", timeout=20,
                   headers={"Authorization": f"Bearer {environ['GITHUB_TOKEN']}"},
                   json={"title": title, "body": body, "head": branch, "base": "main"})
    pr = r.json()
    return {"pr_number": pr["number"], "url": pr["html_url"]}
