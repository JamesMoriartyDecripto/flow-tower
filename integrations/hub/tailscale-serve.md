# Serving a hub on the tailnet

Hub mode keeps the server on loopback and lets `tailscale serve` terminate TLS and forward to it. Never
`tailscale funnel`: Funnel exposes the port to the whole internet, serve only to machines in your tailnet.

## On the hub machine

```bash
# 1. A token per sender (the plaintext is printed once, only its sha256 is stored).
flow-tower token add alice

# 2. Start the server in hub mode. --allowed-host is the public tailnet name Vite must accept in Host.
flow-tower ~/towers --hub --allowed-host hub.tailnet-xyz.ts.net

# 3. Put TLS on the tailnet (background, 443 -> the loopback server).
tailscale serve --bg --https=443 http://127.0.0.1:5317
tailscale serve status           # shows https://hub.tailnet-xyz.ts.net -> http://127.0.0.1:5317
```

Tailscale adds `tailscale-user-login` to each forwarded request, which is how a viewer is recognised.
Add viewers to `~/.config/flow-tower/hub.json`:

```json
{ "viewers": ["alice@example.com"] }
```

Stop serving with `tailscale serve --https=443 off`.

## On a sender

```bash
FLOW_TOWER_URL=https://hub.tailnet-xyz.ts.net \
FLOW_TOWER_TOKEN=ft_alice_… \
flow-tower emit --kind tool.start --agent claude-code -m "opened the repo"
```

`flow-tower emit` reads both variables, so hooks and scripts need no change beyond the environment. A
sender that is not a viewer can still ingest; it just cannot open the UI.
