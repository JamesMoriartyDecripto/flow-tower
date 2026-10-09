"""One-time setup: skill, environment and the two agents (Claude Managed Agents beta).

Investigation and remediation are separate agents so the investigator can never write:
its toolset has no edit tool and no custom write tools.
"""
from pathlib import Path

import anthropic

from tools import CUSTOM_TOOLS_INVESTIGATE, CUSTOM_TOOLS_REMEDIATE

client = anthropic.Anthropic()
ROOT = Path(__file__).resolve().parent.parent
META = {"anthropic_cookbook": "claude-cookbooks/sre-incident-responder"}

# Built-in sandbox tools (bash, read, grep, edit, ...) without web access.
TOOLSET = {
    "type": "agent_toolset_20260401",
    "default_config": {"permission_policy": {"type": "always_allow"}},
    "configs": [
        {"name": "web_search", "enabled": False},
        {"name": "web_fetch", "enabled": False},
    ],
}


def setup() -> dict:
    skill = client.beta.skills.create(
        display_title="incident-runbooks",
        files=[("incident-runbooks/SKILL.md",
                (ROOT / "skills/incident-runbooks/SKILL.md").read_bytes(), "text/markdown")],
    )
    skills = [{"type": "custom", "skill_id": skill.id, "version": skill.latest_version}]

    # Limited networking: the sandbox only needs its own filesystem; external systems
    # are reached through custom tools that the application executes.
    env = client.beta.environments.create(
        name="sre-responder-env",
        config={"type": "cloud", "networking": {"type": "limited"}},
    )

    investigator = client.beta.agents.create(
        name="sre-investigator",
        metadata=META,
        model="claude-opus-5-5",
        system=(ROOT / "prompts/investigator.md").read_text(),
        skills=skills,
        tools=[{**TOOLSET, "configs": TOOLSET["configs"] + [{"name": "edit", "enabled": False},
                                                         {"name": "write", "enabled": False}]},
               *CUSTOM_TOOLS_INVESTIGATE],
    )
    remediator = client.beta.agents.create(
        name="sre-remediator",
        metadata=META,
        model="claude-opus-5-5",
        system=(ROOT / "prompts/remediator.md").read_text(),
        skills=skills,
        tools=[TOOLSET, *CUSTOM_TOOLS_REMEDIATE],
    )
    return {"env": env.id, "investigator": investigator.id, "remediator": remediator.id}


if __name__ == "__main__":
    print(setup())
