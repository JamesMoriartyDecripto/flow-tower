// Pi coding agent extension: copy to ~/.pi/agent/extensions/flow-tower.ts
// Streams Pi lifecycle and tool events to a local flow-tower (fire-and-forget).
const URL = 'http://127.0.0.1:5317/api/events?source=pi';
const EVENTS = [
  'session_start', 'session_shutdown', 'agent_start', 'agent_end', 'turn_end',
  'tool_execution_start', 'tool_execution_end', 'input', 'model_select',
];

export default function (pi: { on(event: string, handler: (e: object, ctx: any) => void): void }) {
  for (const type of EVENTS) {
    pi.on(type, (e, ctx) => {
      const session = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionManager?.getSessionFile?.();
      // Loopback only (127.0.0.1): plain HTTP never leaves the machine, TLS adds nothing here.
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
      fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...e, type, session, cwd: ctx?.cwd }),
        signal: AbortSignal.timeout(1500),
      }).catch(() => {});
    });
  }
}
