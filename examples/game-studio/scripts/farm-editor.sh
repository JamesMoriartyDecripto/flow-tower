#!/usr/bin/env bash
# Launches a headless-capable UE 5.6 editor with Remote Control on a farm node.
# One editor per node; the integration lead and world builder share it through the Unreal MCP.
set -euo pipefail

UE_ROOT="${UE_ROOT:-/opt/UnrealEngine-5.6}"
UPROJECT="${UPROJECT:-/srv/emberwake/Emberwake/Emberwake.uproject}"
RC_PORT="${RC_PORT:-30010}"
LOG="/srv/emberwake/logs/unreal-farm-$(hostname).log"

git -C /srv/emberwake pull --ff-only
"$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh" EmberwakeEditor Linux Development "$UPROJECT" -waitmutex

exec "$UE_ROOT/Engine/Binaries/Linux/UnrealEditor" "$UPROJECT" \
  -RCWebControlEnable -RCWebInterfaceEnable -RCWebControlPort="$RC_PORT" \
  -ExecCmds="py unreal.log('forge farm editor ready')" \
  -unattended -nosplash -log -abslog="$LOG"
