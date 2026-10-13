import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/adapters.ts';
// @ts-expect-error plain JS helper in bin/, no type declarations
import { withStreamSession } from '../bin/stream-context.js';

/**
 * Lines shaped like `pi --mode json` output (Pi 0.73.1), fed through the same path emit uses:
 * stream context first, then the Pi adapter.
 */
const SESSION = 'sess-live-1';
const piLines: Record<string, unknown>[] = [
  { type: 'session', id: SESSION, cwd: '/work/app' },
  { type: 'agent_start' },
  { type: 'turn_start' },
  { type: 'message_start', message: { role: 'user', content: [{ type: 'text', text: 'list the files\nplease' }] } },
  { type: 'message_start', message: { role: 'assistant', content: [] } },
  { type: 'message_update', message: { role: 'assistant' } },
  { type: 'message_end', message: { role: 'assistant' } },
  { type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'bash', args: { command: 'ls -la' } },
  { type: 'tool_execution_update', toolCallId: 'call-1', toolName: 'bash' },
  {
    type: 'tool_execution_end', toolCallId: 'call-1', toolName: 'bash', isError: false,
    result: { content: [{ type: 'text', text: 'a.txt\nb.txt' }] },
  },
  { type: 'before_provider_request' },
  { type: 'after_provider_response' },
  { type: 'context' },
  { type: 'thinking_level_select' },
  {
    type: 'turn_end',
    message: {
      role: 'assistant', model: 'claude-sonnet-4',
      usage: { input: 1200, output: 80, cacheRead: 300, cacheWrite: 50, totalTokens: 1630, cost: { total: 0.0123 } },
    },
  },
  { type: 'agent_end' },
];

/** Runs the lines the way emit does: one stream state, adapter per line. */
function feed(source: string, lines: Record<string, unknown>[]) {
  const state = {};
  return lines.flatMap((line) => normalize(source, withStreamSession(source, line, state)));
}

describe('pi JSON mode, live capture shape', () => {
  const events = feed('pi', piLines) as Array<Record<string, any>>;

  it('gives every event the same session id', () => {
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.session).toBe(SESSION);
  });

  it('has exactly one session.start, carrying the id', () => {
    const starts = events.filter((e) => e.kind === 'session.start');
    expect(starts).toHaveLength(1);
    expect(starts[0].session).toBe(SESSION);
  });

  it('shows the user prompt, clipped, and not the assistant message_start', () => {
    const prompts = events.filter((e) => e.kind === 'prompt');
    expect(prompts).toHaveLength(1);
    expect(prompts[0].message).toBe('list the files\nplease');
  });

  it('pairs tool.start and tool.end by call, with a plain-text result', () => {
    const start = events.find((e) => e.kind === 'tool.start');
    const end = events.find((e) => e.kind === 'tool.end');
    expect(start?.call).toBe('call-1');
    expect(end?.call).toBe('call-1');
    expect(end?.tool).toBe('bash');
    expect(end?.status).toBe('ok');
    expect(end?.message).toBe('a.txt');
  });

  it('emits no log noise for streaming lines', () => {
    expect(events.filter((e) => e.kind === 'log')).toHaveLength(0);
  });

  it('gives usage the model and tokens_detail', () => {
    const usage = events.find((e) => e.kind === 'usage');
    expect(usage?.model).toBe('claude-sonnet-4');
    expect(usage?.tokens).toBe(1630);
    expect(usage?.cost_usd).toBe(0.0123);
    expect(usage?.tokens_detail).toEqual({ input: 1200, output: 80, cache_read: 300, cache_write: 50 });
  });

  it('ends the agent', () => {
    expect(events.at(-1)).toMatchObject({ kind: 'agent.end', status: 'ok', session: SESSION });
  });
});

describe('pi extension shape for tool_execution_end', () => {
  it('uses the first text block, not the raw JSON', () => {
    const [e] = normalize('pi', {
      type: 'tool_execution_end', toolName: 'read', isError: false,
      result: { content: [{ type: 'text', text: 'hello\nmore' }] },
    });
    expect(e).toMatchObject({ kind: 'tool.end', status: 'ok', message: 'hello' });
  });

  it('marks an error without a prefix', () => {
    const [e] = normalize('pi', {
      type: 'tool_execution_end', toolName: 'read', isError: true,
      result: { content: [{ type: 'text', text: 'boom' }] },
    });
    expect(e).toMatchObject({ status: 'error', message: 'boom' });
  });
});

describe('withStreamSession', () => {
  it('reads the pi session id once and adds it to later lines', () => {
    const state = {};
    expect(withStreamSession('pi', { type: 'session', id: 'abc' }, state)).toMatchObject({ session: 'abc' });
    expect(withStreamSession('pi', { type: 'agent_start' }, state)).toEqual({ type: 'agent_start', session: 'abc' });
  });

  it('keeps a session a line already has', () => {
    const state = { session: 'abc' };
    expect(withStreamSession('pi', { type: 'x', session: 'own' }, state)).toEqual({ type: 'x', session: 'own' });
  });

  it('reads the codex thread id and adds it as thread_id', () => {
    const state = {};
    withStreamSession('codex', { type: 'thread.started', thread_id: 't-1' }, state);
    expect(withStreamSession('codex', { type: 'turn.started' }, state)).toEqual({ type: 'turn.started', thread_id: 't-1' });
  });

  it('leaves other sources untouched', () => {
    const state = { session: 'abc' };
    expect(withStreamSession('hermes', { type: 'x' }, state)).toEqual({ type: 'x' });
  });

  it('does not share state between streams', () => {
    withStreamSession('pi', { type: 'session', id: 'one' }, {});
    expect(withStreamSession('pi', { type: 'agent_start' }, {})).toEqual({ type: 'agent_start' });
  });
});

describe('codex thread_id on adapter lines', () => {
  it('sets session from thread_id on a turn line', () => {
    const [e] = normalize('codex', { type: 'turn.started', thread_id: 't-9' });
    expect(e).toMatchObject({ kind: 'agent.start', session: 't-9' });
  });
});
