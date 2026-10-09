"""Small shared state: agent/env ids, session resources, incident -> session map (Redis)."""
from os import environ

import anthropic
import redis

client = anthropic.Anthropic()
r = redis.Redis.from_url(environ.get("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)

ENV_ID = environ["SRE_ENV_ID"]
AGENTS = {
    "investigator": client.beta.agents.retrieve(environ["SRE_INVESTIGATOR_ID"]),
    "remediator": client.beta.agents.retrieve(environ["SRE_REMEDIATOR_ID"]),
}

# Mounted into every session. The token comes from the host secret store, never from code.
RESOURCES = [
    {"type": "github_repository", "url": "https://github.com/example-org/infra",
     "authorization_token": environ["GITHUB_TOKEN"],
     "checkout": {"type": "branch", "name": "main"}, "mount_path": "infra"},
    {"type": "file", "file_id": environ["RUNBOOKS_FILE_ID"], "mount_path": "runbooks"},
]

pending_approvals: set[str] = set()


def seen_incident(incident_id: str) -> str | None:
    return r.get(f"incident:{incident_id}")


def remember_session(incident_id: str, session_id: str) -> None:
    r.set(f"incident:{incident_id}", session_id, ex=7 * 24 * 3600)


def oncall_user_ids() -> set[str]:
    # Synced every 5 minutes from the PagerDuty schedule to Slack user ids.
    return set(r.smembers("oncall:payments:slack"))
