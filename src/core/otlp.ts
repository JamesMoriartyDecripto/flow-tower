import type { FlowEventInput } from './events.ts';

/**
 * OpenTelemetry logs (OTLP/HTTP JSON) → live events. Hooks say *what* agents do; token and cost data
 * only exists in telemetry. Claude Code exports `claude_code.api_request` (cost_usd, tokens, model,
 * query_source, agent.name for subagents) every 5 s; Codex exports `codex.sse_event` (token counts on
 * response.completed) and `codex.turn_cost`. Everything else is ignored: hooks already cover activity.
 */

type AnyValue = {
  stringValue?: string; boolValue?: boolean; intValue?: string | number; doubleValue?: number;
  arrayValue?: { values?: AnyValue[] }; kvlistValue?: { values?: KeyValue[] };
};
type KeyValue = { key?: string; value?: AnyValue };
interface LogRecord { timeUnixNano?: string | number; observedTimeUnixNano?: string | number; body?: AnyValue; attributes?: KeyValue[] }
interface LogsRequest { resourceLogs?: { resource?: { attributes?: KeyValue[] }; scopeLogs?: { logRecords?: LogRecord[] }[] }[] }

function value(v: AnyValue | undefined): unknown {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue); // int64 travels as a string in OTLP JSON
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(value);
  if (v.kvlistValue) return attributes(v.kvlistValue.values);
  return undefined;
}

function attributes(kvs: KeyValue[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of kvs ?? []) if (kv.key) out[kv.key] = value(kv.value);
  return out;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const ms = (nano: unknown) => { const n = num(nano); return n ? Math.round(n / 1e6) : undefined; };

/** One log record → zero or more events. `a` holds resource attributes overlaid with the record's. */
function toEvents(name: string, a: Record<string, unknown>, ts: number | undefined): FlowEventInput[] {
  const session = str(a['session.id']) ?? str(a['conversation.id']);
  const model = str(a.model);
  if (name === 'claude_code.api_request') {
    const input = num(a.input_tokens) ?? 0;
    const output = num(a.output_tokens) ?? 0;
    const cacheRead = num(a.cache_read_tokens) ?? 0;
    const cacheWrite = num(a.cache_creation_tokens) ?? 0;
    return [{
      kind: 'usage', source: 'claude-code', ts, session, model,
      // The main thread has no agent name: map it with a rule such as `match: ["kind:usage&query_source:main"]`.
      agent: str(a['agent.name']),
      tokens: input + output, cost_usd: num(a.cost_usd), duration_ms: num(a.duration_ms),
      query_source: str(a.query_source),
      message: `${model ?? 'model'} · ${input + output} tokens${cacheRead + cacheWrite ? ` (+${cacheRead + cacheWrite} cache)` : ''}`,
      data: { input_tokens: input, output_tokens: output, cache_read_tokens: cacheRead, cache_creation_tokens: cacheWrite, request_id: a.request_id },
    }];
  }
  if (name === 'claude_code.api_error') {
    return [{ kind: 'error', source: 'claude-code', ts, session, model, agent: str(a['agent.name']), status: 'error', message: str(a.error) ?? `API error ${a.status_code ?? ''}`.trim(), query_source: str(a.query_source) }];
  }
  if (name === 'codex.sse_event' && a['event.kind'] === 'response.completed') {
    const input = num(a.input_token_count) ?? 0;
    const output = num(a.output_token_count) ?? 0;
    return [{
      kind: 'usage', source: 'codex', ts, session, model, tokens: input + output,
      message: `${model ?? 'model'} · ${input + output} tokens`,
      data: { input_tokens: input, output_tokens: output, cached_tokens: num(a.cached_token_count), reasoning_tokens: num(a.reasoning_token_count) },
    }];
  }
  if (name === 'codex.turn_cost') {
    const cost = num(a['usage.estimated_usd']);
    return cost === undefined ? [] : [{ kind: 'usage', source: 'codex', ts, session, model, cost_usd: cost, message: `turn cost $${cost.toFixed(4)}` }];
  }
  return [];
}

/** Parses an OTLP/HTTP JSON ExportLogsServiceRequest. Malformed parts are skipped, never thrown. */
export function otlpLogsToEvents(body: unknown): FlowEventInput[] {
  const out: FlowEventInput[] = [];
  for (const rl of (body as LogsRequest | undefined)?.resourceLogs ?? []) {
    const resource = attributes(rl?.resource?.attributes);
    for (const sl of rl?.scopeLogs ?? []) {
      for (const r of sl?.logRecords ?? []) {
        const a = { ...resource, ...attributes(r?.attributes) };
        // Claude Code puts the full name in the body and may put a short one in event.name.
        const raw = str(a['event.name']) ?? str(value(r?.body));
        if (!raw) continue;
        const name = raw.includes('.') ? raw : `${str(resource['service.name']) === 'codex' ? 'codex' : 'claude_code'}.${raw}`;
        out.push(...toEvents(name, a, ms(r?.timeUnixNano) ?? ms(r?.observedTimeUnixNano)));
      }
    }
  }
  return out;
}

/**
 * A plausible Claude Code `api_request` log batch, for the simulators (scripts/simulate.ts, the demo).
 * Token counts are random and the cost uses illustrative per-token prices, not a price list.
 */
export function sampleApiRequest(agent: string | undefined, model = 'claude-sonnet-5-5', session = 'sim') {
  const input = 800 + Math.floor(Math.random() * 5200);
  const output = 100 + Math.floor(Math.random() * 1400);
  const kv = (key: string, v: string | number) => ({ key, value: typeof v === 'string' ? { stringValue: v } : Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v } });
  return {
    resourceLogs: [{
      resource: { attributes: [kv('service.name', 'claude-code')] },
      scopeLogs: [{ logRecords: [{
        timeUnixNano: String(Date.now() * 1e6),
        body: { stringValue: 'claude_code.api_request' },
        attributes: [
          kv('session.id', session), kv('model', model), kv('input_tokens', input), kv('output_tokens', output),
          kv('cost_usd', Math.round((input * 3e-6 + output * 15e-6) * 1e6) / 1e6), kv('duration_ms', 600 + Math.floor(Math.random() * 3000)),
          kv('query_source', agent ? 'subagent' : 'main'), ...(agent ? [kv('agent.name', agent)] : []),
        ],
      }] }],
    }],
  };
}
