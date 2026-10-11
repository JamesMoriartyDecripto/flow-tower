---
name: flow-tower-command-center
description: Run one machine as a hub that collects live events from other machines (laptops, a server, CI, teammates) and view them together. Use when the user wants a command center, a hub, a team view, or "receive from satellites".
---

# Flow Tower: command center

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)).

Detail lives in [docs/command-center.md](../../docs/command-center.md) (roles, config, panel, H key) and [docs/hub-reference.md](../../docs/hub-reference.md) (token rules, what is relayed); the copy-paste server steps are the [kit README](../../examples/command-center/README.md).

## Steps

1. **Pick the machine and how others reach it**: a tailnet with `tailscale serve` (recommended: viewers are recognised by their tailnet login), or a VPS with Caddy ([transport](../../docs/command-center.md#put-a-transport-in-front); kit steps in the [README](../../examples/command-center/README.md)).
2. **Turn on hub mode**: `"hub": true` in the user folder's `config.json` (or `--hub`), then set `allowedHosts` and `viewers` ([set up the hub](../../docs/command-center.md#set-up-the-hub)).
3. **Make one token per sender**: `flow-tower token add <id>`. It is shown once; hand it over privately and never paste it into a repo or chat log ([token rules](../../docs/hub-reference.md#security-model)).
4. **Put the satellites' towers in the hub's own library**: `flow-tower library add <path>` (or a clone of the project). The hub lights only towers it has; without this the events arrive but match no node ([hub rule](../../docs/command-center.md#start-from-the-kit), [my-library skill](../flow-tower-my-library/SKILL.md)).
5. **Start it and verify**: `curl http://127.0.0.1:<port>/api/hub/me` gives `hub: true`; after a satellite connects the `HUB n/m` pill counts it; press `H` to see Now and Machines; a remote viewer gets `READ-ONLY` ([Hub panel](../../docs/command-center.md#the-hub-panel-h)).
6. **Know what never arrives**: prompt text, commands, tool output ([what is relayed](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

**Ask before** exposing a port, installing Tailscale or Caddy, editing system services, or creating tokens.

Report: the hub URL, the token ids created (never the secrets), the towers in its library, and the verification output.
