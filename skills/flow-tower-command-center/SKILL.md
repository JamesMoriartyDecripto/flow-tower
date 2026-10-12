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
3. **Senders get their tokens**: on a tailnet hub, put each user's tailnet login in `viewers`; their machines then connect with `{{FLOW_TOWER_CLI}} connect https://<hub>.ts.net` and the hub mints the token itself (a hub with `viewers` may start with no token yet). For anything else (CI, a VPS behind Caddy, a tagged device): `{{FLOW_TOWER_CLI}} token add <id>` prints the secret once on stdout: capture it straight into a 0600 file or a variable and hand it over privately; never paste it into a chat or a repo ([token rules](../../docs/hub-reference.md#security-model)).
4. **The satellites' towers arrive by themselves**: each machine runs `{{FLOW_TOWER_CLI}} share <tower folder>` ([satellite skill](../flow-tower-satellite/SKILL.md)), and the hub writes it into `towers/<machine>/<name>/` of its library folder (the first library entry that is a folder) and reloads. So serve a folder (the kit serves its own), and let the service write `towers/` there (the kit's unit: `ReadWritePaths`). Towers of senders without a library (CI) still go in by hand: copy them into `towers/` or `{{FLOW_TOWER_CLI}} library add <path>` ([hub rule](../../docs/command-center.md#start-from-the-kit), [kit README](../../examples/command-center/README.md)).
5. **Start it and verify**: with the kit, `{{FLOW_TOWER_CLI}} <kit folder> --hub` (the systemd unit does this); `{{FLOW_TOWER_CLI}} library --hub --no-open [--port N]` when you added library entries instead ([kit README](../../examples/command-center/README.md)). Then `curl http://127.0.0.1:<port>/api/hub/me` gives `hub: true`, `curl http://127.0.0.1:<port>/api/hub/machines` lists each sender, the `HUB n/m` pill counts a connected satellite, `H` shows Now and Machines, and a remote viewer gets `READ-ONLY` ([Hub panel](../../docs/command-center.md#the-hub-panel-h)).
6. **Know what never arrives**: prompt text, commands, tool output ([what is relayed](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

**Ask before** exposing a port, installing Tailscale or Caddy, editing system services, or creating tokens.

Report: the hub URL, the viewers listed, the token ids created (never the secrets), the towers in its library (shared ones under `towers/<machine>/`), and the verification output.
