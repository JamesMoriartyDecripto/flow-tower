#!/bin/sh
# ev <kind> <layer.node> <message> [status] [source] [tower]: one live event on a local Flow Tower.
# Called by run.mjs as a sibling script, so it works from any checkout and any shell.
# The CLI is, in order: $FLOW_TOWER_CLI (a path, run with node when it ends in .js), flow-tower on PATH, then this
# repo's bin/flow-tower.js. With none of them there is no tower to light, so the script exits 0 without a word:
# a squad run in a project without Flow Tower is not an error.
kind=$1; node_id=$2; message=$3; status=$4
source=${5:-${SQUAD_SOURCE:-dev-squad}}
tower=${6:-${SQUAD_TOWER:-Dev Squad}}
here=$(CDPATH= cd "$(dirname "$0")" && pwd)
# Picked before the positional arguments are reused below.
if [ -n "${FLOW_TOWER_CLI:-}" ]; then
  cli=$FLOW_TOWER_CLI
elif command -v flow-tower >/dev/null 2>&1; then
  cli=flow-tower
elif [ -f "$here/../../bin/flow-tower.js" ]; then
  cli=$here/../../bin/flow-tower.js
else
  exit 0
fi
# A .js file is run with node; a command on PATH runs as it is. An empty runner expands to nothing.
case $cli in
  *.js) runner=node ;;
  *) runner= ;;
esac
# The status flag is optional: carry it in the argument list, so no word splitting is needed.
if [ -n "$status" ]; then set -- --status "$status"; else set --; fi
$runner "$cli" emit \
  --url "${FLOW_TOWER_URL:-http://127.0.0.1:5317}" --tower "$tower" --source "$source" \
  --kind "$kind" --node "$node_id" -m "$message" "$@" >/dev/null 2>&1
