// Claude Agent SDK (TypeScript): stream hook events of programmatic agents to flow-tower.
// Usage: query({ prompt, options: { hooks: flowTowerHooks(), ... } })
import type { HookCallback, HookEvent } from '@anthropic-ai/claude-agent-sdk';

const URL = 'http://127.0.0.1:5317/api/events?source=agent-sdk';

const forward: HookCallback = async (input, toolUseID) => {
  // Loopback only (127.0.0.1): plain HTTP never leaves the machine, TLS adds nothing here.
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
  fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, tool_use_id: toolUseID }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {});
  return {}; // observe only, never block
};

const EVENTS: HookEvent[] = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'Stop'];

export const flowTowerHooks = () => Object.fromEntries(EVENTS.map((e) => [e, [{ hooks: [forward] }]]));
