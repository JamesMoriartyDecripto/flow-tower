#!/usr/bin/env bash
# Starts Blender with the MCP addon socket on an artist workstation.
# The orchestrator reaches it through an SSH tunnel; the port is never exposed publicly.
set -euo pipefail

BLENDER="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
PORT="${BLENDER_MCP_PORT:-9876}"
PROJECT="${1:-$HOME/forge/emberwake-art}"

mkdir -p "$PROJECT/exports" "$PROJECT/logs"

# Addon auto-starts the socket server on load (blender-mcp >= 1.2).
"$BLENDER" --python-expr "
import bpy
bpy.ops.preferences.addon_enable(module='blender_mcp')
bpy.context.scene.blendermcp_port = $PORT
bpy.ops.blendermcp.start_server()
" >> "$PROJECT/logs/blender-mcp.log" 2>&1 &

echo "Blender MCP listening on 127.0.0.1:$PORT (pid $!)"
echo "Tunnel from the cluster: ssh -N -R $PORT:127.0.0.1:$PORT forge-bastion"
