---
name: flow-tower-satellite
description: Send a machine's agents' live events to a command center: this machine keeps its own towers and live view, and relays content-free events to a hub. Use when the user wants to connect to a hub, make this machine a satellite, share my runs, or "send data to the hub".
---

# Flow Tower: satellite

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)).

Detail lives in [docs/command-center.md](../../docs/command-center.md#connect-to-it) (the satellite role, `connect`) and [docs/hub-reference.md](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub) (what a satellite relays, its states, the offline queue); hooks are in [docs/realtime.md](../../docs/realtime.md#sources).

## Steps

1. **Have the local towers**: your own ([my-library skill](../flow-tower-my-library/SKILL.md)), or one copied from the gallery ([use-example skill](../flow-tower-use-example/SKILL.md)). A satellite is a workstation with its own library, not a bare sender.
2. **Get a token from the hub's owner**, then run `flow-tower connect <hub-url> --token <t> [--machine <name>] [--user <name>]`. It writes the user folder's `config.json` and sends one heartbeat, so a refused token shows at once ([details](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).
3. **Wire the agent's hooks so events flow.** Claude Code: merge [`integrations/claude-code/settings.json`](../../integrations/claude-code/settings.json); other agents: [docs/realtime.md](../../docs/realtime.md#sources).
4. **Check**: Settings › Sharing → "does it reach the hub?" (or `POST /api/sharing/test`). The SAT chip shows the state (`online` / `queued` / `revoked`); pause with the Sharing switch ([states and queue](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).
5. **Make sure the same tower is in the hub's library**: git, or `flow-tower library add` on the hub's machine. Otherwise the hub lights nothing for these events ([hub rule](../../docs/command-center.md#start-from-the-kit)).
6. **What leaves the machine**: metadata only — time, user, host, runtime, project, kind, tool, model, tokens, cost; no prompts, commands or tool output ([what is relayed](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

**Ask before** writing hook settings into the user's agent config, or sending anything off the machine.

Report: the hub URL, the machine name, the test result, and the towers that will light.
