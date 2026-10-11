# Command Center

A Flow Tower hub on your own server or VPS. Copy this folder to the server and follow the steps. `command-center.tower.yaml` shows the whole deployment as a tower; `deploy/` holds the files it references.

**What the hub never receives:** prompts, commands or file contents. Satellites and `emit` send event metadata only (agent, tool, status, counts).

## 1. Server: Node, the repo, this folder

Node >= 22.13 (`history.db` needs `node:sqlite`). Flow Tower is not on npm: run it from a checkout with its dependencies installed.

```bash
sudo useradd --system --create-home --home-dir /home/flowtower flowtower
sudo -u flowtower git clone https://github.com/JamesMoriartyDecripto/flow-tower /home/flowtower/flow-tower
sudo -u flowtower sh -c 'cd /home/flowtower/flow-tower && npm ci'
sudo cp -r command-center /srv/command-center && sudo chown -R flowtower: /srv/command-center
alias flow-tower='sudo -u flowtower FLOW_TOWER_HOME=/home/flowtower/.config/flow-tower /usr/bin/node /home/flowtower/flow-tower/bin/flow-tower.js'
```

## 2. Config and tokens

```bash
sudo -u flowtower install -d -m 700 /home/flowtower/.config/flow-tower
sudo -u flowtower install -m 600 /srv/command-center/deploy/hub.config.json /home/flowtower/.config/flow-tower/config.json
# allowedHosts: the proxy names in Host; viewers: tailnet logins allowed to open the UI;
# retentionDays: raw history kept, 1..21 (default 14). Keys: ConfigSchema in src/server/config.ts.
# edit allowedHosts and viewers, then:
flow-tower config show
flow-tower token add laptop-1     # prints ft_laptop-1_… once; one token per machine
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

Caddy on a public VPS (ingest only; you view through an SSH forward):

```bash
sudo caddy run --config /srv/command-center/deploy/Caddyfile
ssh -L 5317:127.0.0.1:5317 you@hub.example.com   # then open http://127.0.0.1:5317 on your laptop
```

The SSH forward is for your own view only, never for other machines' events: tunnelled requests look local to the hub.

## 5. Each machine

```bash
flow-tower connect https://hub.example.ts.net --token ft_REPLACE_ME --machine laptop-1
flow-tower ~/towers            # the satellite relay runs inside the local server
```

`deploy/satellite.config.json` shows what `connect` writes to the machine's config.json (mode 0600, it holds the token).

Servers and CI without a local library send with `FLOW_TOWER_URL=… FLOW_TOWER_TOKEN=… flow-tower emit …`.

Then copy each machine's towers into `towers/` on the hub (see `towers/README.md`): the hub can only light up towers it has.

## 6. Check

```bash
curl -s http://127.0.0.1:5317/api/hub/satellites   # on the hub: every satellite, online or offline
```

## Sources

`bin/flow-tower.js` (usage and flags), `src/server/config.ts` (config.json keys), `src/server/hub.ts` (remote ingest and viewers), `src/server/plugin.ts` (`/api/heartbeat`, `/api/hub/satellites`, `history.db`), `src/server/relay.ts` (heartbeat, queue), `src/cli/connect.ts`, `src/cli/token.ts`, `src/server/history/db.ts` (Node 22.13), `integrations/hub/` (Caddyfile, docker-compose.yml, tailscale-serve.md).
