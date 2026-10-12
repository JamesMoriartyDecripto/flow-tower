---
name: flow-tower-satellite
description: Connect this machine to a Flow Tower hub (command center) and share its towers, step by step in plain language. Use when the user wants to connect to a hub, make this machine a satellite, share a tower with the hub, stop sharing one, or "send data to the hub".
---

# Flow Tower: connect a device to a hub

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)). The local server defaults to port **5317**: add `--port N` when it is taken.

You walk the user through it. **One question at a time**, in plain words, and confirm each step before the next. Check what you can yourself; ask only what you cannot detect. **Sharing a tower sends it off this machine: get the user's explicit OK first**, naming the towers and whether files go too.

Background, only when needed: [docs/command-center.md](../../docs/command-center.md#connect-to-it), [docs/hub-reference.md](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub).

## 1. Check the machine (no questions)

| Check | Command | Fine when |
|---|---|---|
| Node | `node --version` | 22.13 or newer |
| Flow Tower up to date | `git -C <flow-tower checkout> fetch -q && git -C <checkout> status -sb` | not `behind`; else offer `git pull` and `npm ci` |
| Tailscale | `tailscale status --json` | `BackendState` is `Running`; note `CurrentTailnet.Name` and `MagicDNSSuffix` |
| Already connected? | `{{FLOW_TOWER_CLI}} config show` | a `url` and `role: satellite` mean it was connected before: say so and ask whether to keep that hub |

Tailscale missing or stopped: the hub is on a tailnet, so this machine must join it (install Tailscale, `tailscale up` with the same account). Ask before installing anything.

## 2. Ask what you cannot detect, one at a time

1. **The hub address**, e.g. `https://hub.<tailnet>.ts.net` (the hub owner knows it). Its name should end with this machine's `MagicDNSSuffix`; if not, the two machines are on different tailnets: say so.
2. **The machine name** only if the hostname is unclear: by default the CLI uses the hostname (`MacBook-Pro.local` → `macbook-pro`).

## 3. Connect

`{{FLOW_TOWER_CLI}} connect <hub-url>` (add `--machine <name>` if the user chose one). On a tailnet hub it gets a token by itself: the user's tailnet login must be in the hub's viewers. The token is written to the user folder's config.json and never printed.

Hubs that are not on a tailnet (a VPS behind Caddy): the hub owner runs `token add <id>` and hands the token over privately; then `connect <hub-url> --token <token>`.

## 4. Start the local library

`{{FLOW_TOWER_CLI}} library --no-open [--port N]` (or restart it if it runs). The relay and the tower sync run inside this server: `connect` alone sends nothing.

## 5. Share towers

Ask, one at a time: **which towers** (list the user's tower folders: `{{FLOW_TOWER_CLI}} library list`), then **YAML only or with files**:
- **YAML only** (default): the structure the hub needs to light the nodes. No file contents leave the machine.
- **With files**: also the files the tower references, so people viewing the hub can open them. Only files inside the tower folder, only text types; `.env`, keys and similar are never sent.

Say exactly what will be sent and wait for the OK. Then, per tower: `{{FLOW_TOWER_CLI}} share <tower folder>` (add `--files` for the second choice). The command prints the files it sends and any it skipped, with the reason. From now on a change to that tower reaches the hub by itself (the local library re-sends it within ~15 s).

To stop: `{{FLOW_TOWER_CLI}} unshare <name>` removes it from the hub. `{{FLOW_TOWER_CLI}} share --list` shows what is shared.

## 6. Live events from the agents

Claude Code: merge [`integrations/claude-code/settings.json`](../../integrations/claude-code/settings.json) into the agent's settings (ask first); other agents: [docs/realtime.md](../../docs/realtime.md#sources). A hook that calls `emit` on a satellite needs `--token ''` ([why](../../docs/command-center.md#connect-to-it)).

## 7. Verify

- `curl -s http://127.0.0.1:<port>/api/sharing`: `state` is `online`, and each shared tower has a `syncedAt` and no `error`.
- `{{FLOW_TOWER_CLI}} share --list`: every share is on the hub.
- In the UI: the SAT chip says online; Settings › Sharing › "does it reach the hub?" answers ok.

## When something fails (one fix each)

| The CLI says | Fix |
|---|---|
| `your tailnet login is not a viewer of this hub` | The hub owner adds the user's tailnet login (`tailscale status --json` → `User`) to `viewers` in the hub's config.json. |
| `enrolment needs a tailnet hub (tailscale serve)` | The address is not a `*.ts.net` name: use the hub's tailnet address, or get a token (`--token`). |
| `This server is not a hub, or is too old for enrolment` | Wrong address, or the hub needs `git pull`: ask its owner. Meanwhile `--token` works. |
| `conflict: token <name> belongs to another user` | That machine name is taken: `--machine <another-name>`. |
| `cannot reach <url>` | Tailscale down or another tailnet (`tailscale status`), or a typo in the address. |
| `not connected: run flow-tower connect` | Do step 3 first. |
| `a sender token is required` (401) on share | The token was revoked or paused on the hub: run `connect` again, or ask the hub owner. |
| `this hub has no library folder` (503) / `could not store the shared tower` (500) | Hub side: its owner checks the library folder exists and the service may write `towers/` (kit: `ReadWritePaths`). |
| a `400` naming a file or a limit | Fix that file, or share YAML only. |
| the tower is shared but nothing lights | The agents' hooks are not wired (step 6), or the local library is not running (step 4). |

Report: the hub address, the machine name, the towers shared and how (YAML only or with files), and the result of step 7.
