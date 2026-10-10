import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { otlpLogsToEvents } from '../src/core/otlp';

/** Real-world batches, kept as files so the identity cascades stay honest. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/otlp/${name}`, import.meta.url), 'utf8'));

const s = (key: string, v: string) => ({ key, value: { stringValue: v } });
const i = (key: string, v: number) => ({ key, value: { intValue: String(v) } });
const d = (key: string, v: number) => ({ key, value: { doubleValue: v } });

/** The shape Claude Code sends with OTEL_EXPORTER_OTLP_PROTOCOL=http/json. */
const claudeCode = (records: object[]) => ({
  resourceLogs: [{
    resource: { attributes: [s('service.name', 'claude-code'), s('service.version', '2.3.0')] },
    scopeLogs: [{ scope: { name: 'com.anthropic.claude_code.events' }, logRecords: records }],
  }],
});

describe('OTLP logs', () => {
  it('turns claude_code.api_request into a usage event with tokens and cost', () => {
    const events = otlpLogsToEvents(claudeCode([{
      timeUnixNano: '1760000000000000000',
      body: { stringValue: 'claude_code.api_request' },
      attributes: [
        s('event.name', 'api_request'), s('session.id', 'sess-1'), s('model', 'claude-sonnet-5-5'),
        d('cost_usd', 0.0123), i('input_tokens', 1200), i('output_tokens', 300), i('cache_read_tokens', 5000),
        i('cache_creation_tokens', 0), i('duration_ms', 2100), s('query_source', 'subagent'), s('agent.name', 'researcher'),
      ],
    }]));
    expect(events).toEqual([expect.objectContaining({
      kind: 'usage', source: 'claude-code', session: 'sess-1', agent: 'researcher', model: 'claude-sonnet-5-5',
      tokens: 1500, cost_usd: 0.0123, duration_ms: 2100, query_source: 'subagent', ts: 1_760_000_000_000,
    })]);
  });

  it('maps API errors and ignores events that hooks already cover', () => {
    const events = otlpLogsToEvents(claudeCode([
      { body: { stringValue: 'claude_code.api_error' }, attributes: [s('error', 'overloaded'), i('status_code', 529)] },
      { body: { stringValue: 'claude_code.tool_result' }, attributes: [s('tool_name', 'Bash')] },
      { body: { stringValue: 'claude_code.user_prompt' }, attributes: [i('prompt_length', 42)] },
    ]));
    expect(events).toEqual([expect.objectContaining({ kind: 'error', status: 'error', message: 'overloaded' })]);
  });

  it('reads Codex token counts and turn cost', () => {
    const events = otlpLogsToEvents({
      resourceLogs: [{
        resource: { attributes: [s('service.name', 'codex_cli_rs')] },
        scopeLogs: [{ logRecords: [
          { attributes: [s('event.name', 'codex.sse_event'), s('event.kind', 'response.completed'), s('conversation.id', 'c1'), s('model', 'gpt-5.1-codex'), i('input_token_count', 800), i('output_token_count', 200), i('cached_token_count', 100)] },
          { attributes: [s('event.name', 'codex.sse_event'), s('event.kind', 'response.output_text.delta')] },
          { attributes: [s('event.name', 'codex.turn_cost'), s('conversation.id', 'c1'), d('usage.estimated_usd', 0.05)] },
        ] }],
      }],
    });
    expect(events).toEqual([
      expect.objectContaining({ kind: 'usage', source: 'codex', session: 'c1', tokens: 1000 }),
      expect.objectContaining({ kind: 'usage', source: 'codex', session: 'c1', cost_usd: 0.05 }),
    ]);
  });

  it('never throws on malformed input', () => {
    for (const bad of [undefined, null, 42, 'x', {}, { resourceLogs: 'no' }, { resourceLogs: [{ scopeLogs: [{ logRecords: [null, {}, { body: {} }] }] }] }]) {
      expect(() => otlpLogsToEvents(bad)).not.toThrow();
    }
  });
});

describe('OTLP identity (#82)', () => {
  it('carries who/where/what from the resource on a Claude Code request', () => {
    const [e] = otlpLogsToEvents(fixture('claude-code.json'));
    expect(e).toMatchObject({
      source: 'claude-code', user: 'dev@example.com', runtime: 'claude-code', session: 'sess-1',
      tokens: 1500, tokens_detail: { input: 1200, output: 300, cache_read: 5000, cache_write: 0 },
    });
  });

  it('reads the Codex conversation and reports the agent cost, not an estimate', () => {
    const events = otlpLogsToEvents(fixture('codex.json'));
    expect(events[0]).toMatchObject({ source: 'codex', user: 'user-9', runtime: 'codex_cli_rs', session: 'conv-7', tokens: 1000, tokens_detail: { input: 800, output: 200 } });
    expect(events[1]).toMatchObject({ user: 'user-9', session: 'conv-7', cost_usd: 0.05 });
    expect(events[1]!.tokens).toBeUndefined();
  });

  it('maps Gemini CLI token counts through the generic usage branch', () => {
    const [e] = otlpLogsToEvents(fixture('gemini-cli.json'));
    expect(e).toMatchObject({
      kind: 'usage', source: 'gemini-cli', runtime: 'gemini-cli', project: 'my-project',
      session: 'g-sess', model: 'gemini-2.5-pro', tokens: 140, tokens_detail: { input: 100, output: 40 },
    });
    expect(e!.cost_usd).toBeUndefined();
    expect(e!.user).toBeUndefined();
  });

  it('lets a collector-added enduser.id beat the agent-reported user.email', () => {
    const [e] = otlpLogsToEvents(fixture('collector-enriched.json'));
    expect(e).toMatchObject({
      user: 'alice@example.com', host: 'ip-10-0-0-1', runtime: 'claude-code/production', session: 'sess-99',
    });
  });
});
