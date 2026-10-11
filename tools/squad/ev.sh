#!/bin/sh
# ev <kind> <layer.node> <message> [status] [source] [tower]: one live event on a local Flow Tower.
# Called by run.mjs as a sibling script, so it works from any checkout and any shell.
kind=$1; node_id=$2; message=$3; status=$4
source=${5:-${SQUAD_SOURCE:-dev-squad}}
tower=${6:-${SQUAD_TOWER:-Dev Squad}}
here=$(CDPATH= cd "$(dirname "$0")" && pwd)
# The status flag is optional: carry it in the argument list, so no word splitting is needed.
if [ -n "$status" ]; then set -- --status "$status"; else set --; fi
node "$here/../../bin/flow-tower.js" emit \
  --url "${FLOW_TOWER_URL:-http://127.0.0.1:5317}" --tower "$tower" --source "$source" \
  --kind "$kind" --node "$node_id" -m "$message" "$@" >/dev/null 2>&1
