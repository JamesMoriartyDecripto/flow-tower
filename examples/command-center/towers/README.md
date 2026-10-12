# towers/

The towers of the connected machines live here, one subfolder per machine: `towers/<machine>/<name>/`.

A satellite fills it itself: `flow-tower share <tower folder>` uploads the tower (YAML only by default; `--files` adds the files it references), the hub writes it here and reloads, and the satellite re-sends it when it changes. `flow-tower unshare <name>` removes it. The hub service must be allowed to write this folder (the kit's systemd unit lists it in `ReadWritePaths`).

Senders without a library (CI, a server that only runs `emit`) cannot share: copy their `*.tower.yaml` (and the files it references) into a subfolder here by hand.

The hub matches incoming events by tower name or id, so it can only light up towers it has.
