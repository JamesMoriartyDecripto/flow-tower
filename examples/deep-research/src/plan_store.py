"""Plan memory, artifact store and checkpoints.

The lead saves its plan before delegating: context past the window gets
truncated, and a resumed (or fresh) lead reloads the plan from here.
Subagents write long excerpts as artifacts and pass back only references,
so large content never travels through the lead's context ("telephone game").
"""
import hashlib
import json
from pathlib import Path

ROOT = Path("/var/lib/deep-research")


def save_plan(run_id: str, plan: dict) -> Path:
    path = ROOT / "plans" / f"{run_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(plan, indent=2))
    return path


def load_plan(run_id: str) -> dict | None:
    path = ROOT / "plans" / f"{run_id}.json"
    return json.loads(path.read_text()) if path.exists() else None


def save_artifact(run_id: str, url: str, text: str) -> str:
    """Store a page excerpt; return a short reference like art:3f9a1c."""
    ref = "art:" + hashlib.sha256(url.encode()).hexdigest()[:6]
    path = ROOT / "artifacts" / run_id / f"{ref[4:]}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"url": url, "text": text}))
    return ref


def load_artifacts(run_id: str) -> list[dict]:
    folder = ROOT / "artifacts" / run_id
    return [json.loads(p.read_text()) for p in sorted(folder.glob("*.json"))]


def checkpoint(run_id: str, step: str, state: dict) -> None:
    """Resume from the failed step instead of restarting a multi-hour run."""
    path = ROOT / "checkpoints" / run_id / f"{step}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state))
