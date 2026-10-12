---
name: flow-tower-command-center
description: Run one machine as a hub that collects live events from other machines (laptops, a server, CI, teammates) and view them together. Use when the user wants a command center, a hub, a team view, or "receive from satellites".
---

# Flow Tower: command center

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)). Everything defaults to port **5317**: add `--port N` when it is taken.

Detail lives in [docs/command-center.md](../../docs/command-center.md) (roles, config, panel, H key) and [docs/hub-reference.md](../../docs/hub-reference.md) (token rules, what is relayed); the copy-paste server steps are the [kit README](../../examples/command-center/README.md).

## Steps

1. **Pick the machine and how others reach it**: a tailnet with `tailscale serve` (recommended: viewers are recognised by their tailnet login), or a VPS with Caddy ([transport](../../docs/command-center.md#put-a-transport-in-front); kit steps in the [README](../../examples/command-center/README.md)).
2. **Turn on hub mode**: `"hub": true` in the user folder's `config.json` (or `--hub`). Set `allowedHosts` and `viewers` **only when a proxy** (tailscale serve or Caddy) sits in front: on loopback both are unneeded ([set up the hub](../../docs/command-center.md#set-up-the-hub)).
3. **Make one token per sender**: `{{FLOW_TOWER_CLI}} token add <id>` prints the secret once on stdout: capture it straight into a 0600 file or a variable and hand it over privately; never paste it into a chat or a repo ([token rules](../../docs/hub-reference.md#security-model)).
4. **Give the hub the satellites' towers, with an entry or a folder**: `{{FLOW_TOWER_CLI}} library add <path>` records entries a `library` serve reads; the kit's systemd unit and compose file serve a folder instead, which ignores library entries, so copy the towers into that folder ([hub rule](../../docs/command-center.md#start-from-the-kit), [kit README](../../examples/command-center/README.md), [my-library skill](../flow-tower-my-library/SKILL.md)).
5. **Start it and verify**: run `{{FLOW_TOWER_CLI}} library --hub --no-open [--port N]` when step 4 added library entries; with the kit, `{{FLOW_TOWER_CLI}} <towers folder> --hub` after copying the towers into it ([kit README](../../examples/command-center/README.md)). Then `curl http://127.0.0.1:<port>/api/hub/me` gives `hub: true`, `curl http://127.0.0.1:<port>/api/hub/machines` lists each sender, the `HUB n/m` pill counts a connected satellite, `H` shows Now and Machines, and a remote viewer gets `READ-ONLY` ([Hub panel](../../docs/command-center.md#the-hub-panel-h)).
6. **Know what never arrives**: prompt text, commands, tool output ([what is relayed](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

**Ask before** exposing a port, installing Tailscale or Caddy, editing system services, or creating tokens.

Report: the hub URL, the token ids created (never the secrets), the towers in its library, and the verification output.
