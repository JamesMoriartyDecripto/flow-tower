# Command Center

A Flow Tower hub on your own server or VPS: the **one home of the server install steps**. Copy this folder to the server and follow the steps. Why each part exists, config precedence and troubleshooting: [docs/command-center.md](../../docs/command-center.md). `command-center.tower.yaml` shows the whole deployment as a tower; `deploy/` holds the files it references.

**What the hub never receives:** prompts, commands or file contents. Satellites and `emit` send event metadata only (agent, tool, status, counts).

## 1. Server: Node, the repo, this folder

Node >= 22.13 (`history.db` needs `node:sqlite`). Ubuntu 24.04 ships Node 20 as `/usr/bin/node`, so install the official Node 22 tarball to `/opt/node22` and leave the system Node alone. Pick any 22.x at or above 22.13 from [nodejs.org/dist/latest-v22.x](https://nodejs.org/dist/latest-v22.x/); the checksum comes from the same release's `SHASUMS256.txt`:

```bash
NODE=v22.23.3 ARCH=linux-x64      # or linux-arm64
curl -fsSLO https://nodejs.org/dist/$NODE/node-$NODE-$ARCH.tar.xz
curl -fsSL https://nodejs.org/dist/$NODE/SHASUMS256.txt | grep " node-$NODE-$ARCH.tar.xz\$" | sha256sum -c -
sudo install -d /opt/node22 && sudo tar -xJf node-$NODE-$ARCH.tar.xz -C /opt/node22 --strip-components=1
/opt/node22/bin/node --version
```

Flow Tower is not on npm: run it from a checkout with its dependencies installed.

```bash
sudo useradd --system --create-home --home-dir /home/flowtower flowtower
sudo -u flowtower git clone https://github.com/JamesMoriartyDecripto/flow-tower /home/flowtower/flow-tower
sudo -u flowtower sh -c 'cd /home/flowtower/flow-tower && PATH=/opt/node22/bin:$PATH npm ci'
# Vite's caches: the unit's ReadWritePaths needs both to exist (.vite-temp holds the bundled vite.config).
sudo -u flowtower install -d /home/flowtower/flow-tower/node_modules/.vite /home/flowtower/flow-tower/node_modules/.vite-temp
sudo cp -r command-center /srv/command-center && sudo chown -R flowtower: /srv/command-center
alias flow-tower='sudo -u flowtower FLOW_TOWER_HOME=/home/flowtower/.config/flow-tower /opt/node22/bin/node /home/flowtower/flow-tower/bin/flow-tower.js'
```

## 2. Config and tokens

```bash
sudo -u flowtower install -d -m 700 /home/flowtower/.config/flow-tower
sudo -u flowtower install -m 600 /srv/command-center/deploy/hub.config.json /home/flowtower/.config/flow-tower/config.json
# allowedHosts: the proxy names in Host; viewers: tailnet logins allowed to open the UI and to
# connect their machines without a token (step 5);
# retentionDays: raw history kept, 1..21 (default 14). Keys: ConfigSchema in src/server/config.ts.
# edit allowedHosts and viewers, then:
flow-tower config show
flow-tower token add ci-runner    # senders that cannot enrol (CI, non-tailnet): prints ft_ci-runner_… once
# Without Tailscale (viewers: []), create at least one token now: a hub with neither a token nor viewers refuses to start.
```

## 3. Start the service (systemd or docker)

```bash
sudo cp /srv/command-center/deploy/flow-tower.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now flow-tower
journalctl -u flow-tower -f
```

Or `FLOW_TOWER_REPO=/home/flowtower/flow-tower docker compose -f /srv/command-center/deploy/docker-compose.yml up -d`.

## 4. Transport: pick one

Tailscale (recommended: viewers are recognised by their tailnet login):

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:5317   # never `tailscale funnel`
```

The first time, Serve needs a one-time admin step: the command answers "Serve is not enabled on your tailnet" with a link. Open it as a tailnet admin to enable Serve and HTTPS certificates, then run the command again.

Test from **another** tailnet device (`curl -sI https://hub.example.ts.net`, or open it in a browser). A request from the server to its own tailnet name or IP can reach whatever already listens on `0.0.0.0:443` there, not Serve, so a check on the server itself proves nothing.

Caddy for a team without Tailscale (teammates connect with a token and `share`; you view through an SSH forward). Install Caddy from your distribution, point your domain's DNS at the server, set `allowedHosts` to that domain and `url` to `https://<domain>` in config.json, then:

```bash
sudo caddy run --config /srv/command-center/deploy/Caddyfile.hub
```

Caddy for senders only (CI, Lambda: ingest only, no `share`; you view through an SSH forward):

```bash
sudo caddy run --config /srv/command-center/deploy/Caddyfile
ssh -L 5317:127.0.0.1:5317 you@hub.example.com   # then open http://127.0.0.1:5317 on your laptop
```

The SSH forward is for your own view only, never for other machines' events: tunnelled requests look local to the hub.

## 5. Each machine

On a tailnet, with the user's tailnet login in `viewers` (step 2), four commands per machine and no token to copy. Any harness works (Claude Code, Codex, Pi, Hermes). Without `npm link`, the CLI prints the `node <checkout>/bin/flow-tower.js` form to use:

```bash
flow-tower connect https://hub.example.ts.net     # the hub mints this machine's token (named after the hostname, or --machine)
flow-tower hooks install                          # wires every harness found on this machine to the local library
flow-tower service install                        # keeps the local library running at login (systemd user unit or launchd)
flow-tower share ~/towers/my-project              # the hub gets the tower in towers/<machine>/my-project/; YAML only, --files adds referenced files
```

`flow-tower unshare my-project` removes it from the hub; `flow-tower share --list` shows what is shared. An agent can walk the user through it: [`skills/flow-tower-satellite`](../../skills/flow-tower-satellite/SKILL.md).

**A team without Tailscale** (a VPS or an office server): run the hub as above, put [`deploy/Caddyfile.hub`](deploy/Caddyfile.hub) in front (TLS for your domain; it forwards events, heartbeats, OTLP and shared towers, nothing else), and set `allowedHosts` to your domain and `viewers` to `[]` (remove the kit's `example` placeholders: the hub warns about them at start). Per machine: `flow-tower token add laptop-1` on the hub prints the connect line to run on the laptop (it reads `http://127.0.0.1:5317` until you set `url` in the hub's config.json: use `https://hub.example.com`); then `share` works as on a tailnet. The owner views the hub over SSH (`ssh -N -L 5317:127.0.0.1:5317 you@hub.example.com`); other people cannot view it without Tailscale. `deploy/satellite.config.json` shows what `connect` writes (mode 0600, it holds the token). The ingest-only [`Caddyfile`](../../integrations/hub/Caddyfile) is for senders only (Lambda, CI): no `share` there.

Servers and CI without a local library send with `FLOW_TOWER_URL=… FLOW_TOWER_TOKEN=… flow-tower emit …`, and their towers are copied into `towers/` by hand (see `towers/README.md`): the hub can only light up towers it has.

## 6. Check

```bash
curl -s http://127.0.0.1:5317/api/hub/satellites   # on the hub: every satellite, online or offline
ls /srv/command-center/towers/*                    # on the hub: the towers each machine shared
```

The service transforms the app right after it starts listening (Vite `server.warmup`): give it a minute before the first viewer opens the page. Without the warmup, the first load over the tailnet took about 45 s on a cold cache.

## Sources

`bin/flow-tower.js` (usage and flags), `src/server/config.ts` (config.json keys), `src/server/hub.ts` (remote ingest and viewers), `src/server/plugin.ts` (`/api/heartbeat`, `/api/hub/satellites`, `history.db`), `src/server/relay.ts` (heartbeat, queue), `src/cli/connect.ts`, `src/cli/share.ts`, `src/server/enroll.ts`, `src/server/shared-towers.ts`, `src/cli/token.ts`, `src/server/history/db.ts` (Node 22.13), `vite.config.ts` (`server.warmup`), [Node.js release downloads](https://nodejs.org/dist/latest-v22.x/) (`SHASUMS256.txt`), [Tailscale Serve](https://tailscale.com/kb/1312/serve), `integrations/hub/` (Caddyfile, docker-compose.yml, tailscale-serve.md).
