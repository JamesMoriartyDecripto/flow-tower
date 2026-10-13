/**
 * Per-stream session context for JSONL streams (`pi --mode json`, `codex exec --json`).
 *
 * Only the first line of a stream names the session (Pi: `type: 'session'` with `id`; Codex:
 * `thread.started` with `thread_id`). Later lines carry no session, so without this they would
 * all land as sessionless events. `state` is the per-stream memory: create one per stream and
 * pass it to every line. Returns the line with the session added when it has none.
 */
export function withStreamSession(source, line, state) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return line;
  if (source === 'pi') {
    if (line.type === 'session' && typeof line.id === 'string') state.session = line.id;
    if (state.session !== undefined && line.session === undefined) return { ...line, session: state.session };
    return line;
  }
  if (source === 'codex') {
    if (line.type === 'thread.started' && typeof line.thread_id === 'string') state.thread_id = line.thread_id;
    if (state.thread_id !== undefined && line.thread_id === undefined) return { ...line, thread_id: state.thread_id };
    return line;
  }
  return line;
}
