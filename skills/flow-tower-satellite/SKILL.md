---
name: flow-tower-satellite
description: Connect this machine to a Flow Tower hub (command center) and share its towers, step by step in plain language. Use when the user wants to connect to a hub, make this machine a satellite, share a tower with the hub, stop sharing one, or "send data to the hub".
---

# Flow Tower: connect a device to a hub

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)). The local server defaults to port **5317**: add `--port N` when it is taken.

You walk the user through it. **One question at a time**, in plain words, and confirm each step before the next. Check what you can yourself; ask only what you cannot detect. **Sharing a tower sends it off this machine: get the user's explicit OK first**, naming the towers and whether files go too.

Background, only when needed: [docs/command-center.md](../../docs/command-center.md#connect-to-it), [docs/hub-reference.md](../../docs/hub-reference.md#satellite-a-local-library-that-relays-to-the-hub).

## 1. Check the machine (no questions)

| Check | Command | Fine when | If not |
|---|---|---|---|
| Node | `node --version` | 22.13 or newer | Look for a newer Node already installed (`ls /opt/node*/bin`, nvm, Homebrew); take the highest version, else ask before installing Node 22 LTS. Then call the CLI with that binary's full path (`/opt/node22/bin/node <checkout>/bin/flow-tower.js …`) or put its `bin` first in `PATH`, here and in step 6. (Too old, the CLI fails with `bad option: --experimental-strip-types`.) |
| Flow Tower up to date | `git -C <checkout> fetch -q && git -C <checkout> status -sb` | the first line shows `...origin/<branch>` and no `behind` | `behind`: offer `git pull` and `npm ci`. No `...origin/` part: `git -C <checkout> rev-list --left-right --count HEAD...origin/main`; the second number is how many commits it is behind `origin/main` (0: up to date). |
| Tailscale | `tailscale status --json \| jq '{BackendState, tailnet: .CurrentTailnet.Name, suffix: .MagicDNSSuffix, login: .User[(.Self.UserID\|tostring)].LoginName}'` | `BackendState` is `Running` | Stopped or missing: this machine must join the hub's tailnet (`tailscale up` with the same account). Ask before installing anything. Keep `login`: the hub must list it. No `jq`: read those fields from `tailscale status --json` yourself. macOS app without the CLI: `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. |
| Already connected? | `{{FLOW_TOWER_CLI}} config show` | `role` is `local` and no `url` | A `url` and `role: satellite`: it was connected before. Say to which hub, and ask whether to keep it. |
| Port free | `curl -s -m 2 http://127.0.0.1:<port>/api/sharing` | no answer (nothing listens) | Something answers: a flow-tower is already running there. Use it if its `hub` is the right one, else pick another `--port`. |

## 2. Ask what you cannot detect, one at a time

1. **The hub address**, e.g. `https://hub.<tailnet>.ts.net` (the hub owner knows it). Its name should end with this machine's `suffix` from step 1; if not, the machines are on different tailnets: say so.
2. **The machine name.** Show the default (the hostname, lower case, `.local` removed: `MacBook-Pro.local` → `macbook-pro`) and ask once whether the hub should show this machine under it. Generated names like `srv1011283` or `DESKTOP-4F2K` are worth renaming (`--machine <name>`).

## 3. Connect

`{{FLOW_TOWER_CLI}} connect <hub-url> [--machine <name>]`. On a tailnet hub it gets a token by itself: the user's tailnet `login` must be in the hub's viewers. The token goes to the user folder's config.json and is never printed. The hub names this machine's events after the machine name; `--user` is optional (a label for this machine's own view only).

Hubs that are not on a tailnet: the hub owner runs `token add <id>` and hands the token over privately; then `connect <hub-url> --token <token>`. Behind the kit's `Caddyfile.hub`, `share` works as on a tailnet. Only behind the ingest-only `Caddyfile` (CI, Lambda) are towers copied to the hub by hand: skip step 4 there.

## 4. Share towers

1. **Which towers.** `{{FLOW_TOWER_CLI}} library list` shows the folders already in the user's library. Empty (`no towers yet`): ask where their tower folders are, then look there (`find <that folder> -name '*.tower.yaml' -not -path '*/node_modules/*' 2>/dev/null`; all of `~` only if they do not know). A tower folder is the folder that holds a `.tower.yaml`. Ask which ones to share.
2. **YAML only or with files**, per tower:
   - **YAML only** (default): the structure the hub needs to light the nodes. No file contents leave the machine.
   - **With files**: also the files the tower references (its nodes' `files:` and prompt files), so people viewing the hub can open them. Only files inside the tower folder, only text types; `.env`, keys and similar are never sent. Name those files in the OK; `share` prints the exact list and anything it skipped.
3. **The OK.** Say exactly what will go (tower names, YAML only or with which files, to which hub) and wait for yes.
4. Per tower: `{{FLOW_TOWER_CLI}} share <tower folder>` (add `--files` for the second choice). It prints every file it sends and any it skipped with the reason, and adds the folder to the user's library if it was not there.

To stop later: `{{FLOW_TOWER_CLI}} unshare <name>` removes it from the hub; `<name>` is what `share --list` shows (the folder name, not the YAML `name:`).

## 5. Start the local library

Offer `{{FLOW_TOWER_CLI}} service install [--port N]` (ask first): it keeps the library running at login (a systemd user unit on Linux, a launchd agent on macOS) with this machine's `FLOW_TOWER_HOME`, so no event is lost; `service status` checks it, `service uninstall` removes it. On Linux without a desktop login, also `loginctl enable-linger $USER`. Without systemd or launchd: `{{FLOW_TOWER_CLI}} library --no-open [--port N]` in the background (`nohup … > ~/flow-tower.log 2>&1 &`) or a terminal left open. A running library picks up `connect` within 5 s. An `ExperimentalWarning` about SQLite in the log is normal. The relay and the tower sync run inside it: from then on a change to a shared tower reaches the hub within ~15 s. If the library is down anyway, `emit` (Codex, Pi JSON mode, SessionStart) posts straight to the hub; Claude Code's http hooks cannot, so keep the service on.

## 6. Live events from the agents (ask first)

`{{FLOW_TOWER_CLI}} hooks install --dry-run` shows which harnesses it found (Claude Code, Codex, Pi, Hermes) and what it would change; after the user's OK, run it without `--dry-run`. It keeps the user's own hooks, backs each changed file up, and uses the port of the library from step 5. Then tell the user the next step it prints per harness (Codex: approve with `/hooks`; Pi and Hermes: restart them). `{{FLOW_TOWER_CLI}} hooks status` checks it later. The Agent SDK and scripts: [docs/realtime.md](../../docs/realtime.md#sources).

## 7. Verify

- `curl -s http://127.0.0.1:<port>/api/sharing`: `state` is `online`, and each shared tower has a `syncedAt` and no `error`. Right after the start `towers` can be empty: wait ~15 s and check again.
- `curl -s -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:<port>/api/sharing/test`: `state` is `online`.
- `{{FLOW_TOWER_CLI}} share --list`: every share is listed as on the hub.
- With hooks wired (step 6): start a new agent session, then `/api/sharing` shows a newer `lastSentAt` and `queued` back at 0.
- In the UI (optional): the top-bar chip reads `SAT → <hub host> · <time since the last send>`, green when online; Settings › Sharing › **Send a test event** › **Send test** answers `Last test: online`.

## When something fails (one fix each)

| The CLI says | Fix |
|---|---|
| `your tailnet login is not a viewer of this hub` | The hub owner adds the user's tailnet `login` (step 1) to `viewers` in the hub's config.json. |
| `enrolment needs a tailnet hub (tailscale serve)` | The address is not a `*.ts.net` name: use the hub's tailnet address, or get a token (`--token`). |
| `This server is not a hub, or is too old for enrolment` | Wrong address, or the hub needs `git pull`: ask its owner. Meanwhile `--token` works. |
| `conflict: token <name> belongs to another user` | That machine name is taken: `--machine <another-name>`. |
| `cannot reach <url>` | Tailscale down or another tailnet (`tailscale status`), or a typo in the address. |
| `not connected: run flow-tower connect` | Do step 3 first. |
| `your library is empty` (step 5) | Share a tower first (step 4), or `{{FLOW_TOWER_CLI}} library add <tower folder>`. |
| `a sender token is required` (401) on share | The token was revoked on the hub: run `connect` again, or ask the hub owner. |
| `/api/sharing` says `held`, or the CLI says `this machine is paused on the hub` | The hub owner paused this machine: nothing to do here, it resumes by itself when they resume it. |
| `this hub has no library folder` (503) / `could not store the shared tower` (500) | Hub side: its owner checks the library folder exists and the service may write `towers/` (kit: `ReadWritePaths`). |
| a `400` naming a file or a limit | Fix that file, or share YAML only. |
| `share` says `<file>: <error>`, or Settings › Sharing shows `not sent` | The tower has an error: `validate` it, fix it, save; the hub keeps the last valid version meanwhile. |
| `/api/sharing` shows another `hub`, or towers you did not share | Another server answered on that port: stop it or use another `--port`. |
| the tower is shared but nothing lights | The agents' hooks are not wired (step 6), or the local library is not running (step 5). |

Report: the hub address, the machine name, the towers shared and how (YAML only or with files), and the result of step 7.
