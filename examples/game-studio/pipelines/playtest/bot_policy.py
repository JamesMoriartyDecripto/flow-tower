"""Persona-driven exploration policy for automated playtest bots.

Runs inside the packaged build through the Emberwake automation plugin
(`Emberwake.exe -nullrhi -ExecCmds="Automation RunBot <persona> <seed>"`) or
standalone against the telemetry socket for offline replays. The policy only sees
what a player would see (observation dict), never game internals.

Personas (from prompts/playtest-bot.md): explorer, speedrunner, hoarder, griefer, newbie.
"""
import json
import random
from dataclasses import dataclass, field

PERSONAS = {
    "explorer":    {"explore": 0.6, "objective": 0.2, "gather": 0.15, "fight": 0.05, "patience_s": 900},
    "speedrunner": {"explore": 0.05, "objective": 0.8, "gather": 0.05, "fight": 0.1, "patience_s": 300},
    "hoarder":     {"explore": 0.2, "objective": 0.1, "gather": 0.65, "fight": 0.05, "patience_s": 1200},
    "griefer":     {"explore": 0.3, "objective": 0.0, "gather": 0.1, "fight": 0.6, "patience_s": 600},
    "newbie":      {"explore": 0.4, "objective": 0.3, "gather": 0.2, "fight": 0.1, "patience_s": 600, "misinput": 0.15},
}


@dataclass
class BotState:
    persona: str
    seed: int
    elapsed_s: float = 0.0
    stuck_s: float = 0.0
    last_pos: tuple = (0.0, 0.0, 0.0)
    events: list = field(default_factory=list)


class BotPolicy:
    def __init__(self, persona: str, seed: int):
        self.cfg = PERSONAS[persona]
        self.rng = random.Random(seed)
        self.state = BotState(persona, seed)

    def act(self, obs: dict, dt: float) -> dict:
        """obs: {pos, hp, lantern_fuel, visible: [{type, pos, dist}], objective_pos, inventory}."""
        s = self.state
        s.elapsed_s += dt
        moved = sum((a - b) ** 2 for a, b in zip(obs["pos"], s.last_pos)) ** 0.5
        s.stuck_s = s.stuck_s + dt if moved < 0.2 else 0.0
        s.last_pos = tuple(obs["pos"])

        if s.stuck_s > 8:
            self.log("stuck", obs)
            s.stuck_s = 0.0
            return {"action": "jump", "dir": self.rng.uniform(0, 360)}
        if obs["lantern_fuel"] < 0.15:
            return self.goto_nearest(obs, "ember_vein") or {"action": "rekindle"}
        if obs["hp"] < 0.3 and self.state.persona != "griefer":
            return self.goto_nearest(obs, "camp") or {"action": "retreat"}
        if self.cfg.get("misinput") and self.rng.random() < self.cfg["misinput"]:
            return {"action": self.rng.choice(["dodge", "interact", "open_menu"])}

        intent = self.rng.choices(list(("explore", "objective", "gather", "fight")),
                                  weights=[self.cfg[k] for k in ("explore", "objective", "gather", "fight")])[0]
        if intent == "objective":
            return {"action": "move_to", "target": obs["objective_pos"]}
        if intent == "gather":
            return self.goto_nearest(obs, "ember_vein") or self.wander()
        if intent == "fight":
            return self.goto_nearest(obs, "cinder_wisp", verb="attack") or self.wander()
        return self.wander()

    def goto_nearest(self, obs, kind, verb="move_to"):
        seen = [v for v in obs["visible"] if v["type"] == kind]
        if not seen:
            return None
        return {"action": verb, "target": min(seen, key=lambda v: v["dist"])["pos"]}

    def wander(self):
        return {"action": "move_dir", "dir": self.rng.uniform(0, 360), "duration_s": self.rng.uniform(2, 6)}

    def log(self, kind, obs):
        self.state.events.append({"t": round(self.state.elapsed_s, 1), "kind": kind, "pos": obs["pos"]})

    def done(self) -> bool:
        return self.state.elapsed_s >= self.cfg["patience_s"]

    def report(self) -> str:
        return json.dumps({"persona": self.state.persona, "seed": self.state.seed,
                           "duration_s": round(self.state.elapsed_s), "events": self.state.events})
