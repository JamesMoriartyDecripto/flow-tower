import type { OpsDef } from '../core/schema';

/** Short, uppercase markers for a node subtitle, most important first. */

const TRIGGER: Record<string, string> = {
  manual: 'MANUAL', cron: 'CRON', webhook: 'WEBHOOK', event: 'EVENT', queue: 'QUEUE', chat: 'CHAT', email: 'EMAIL', file: 'FILE',
};
const SENSITIVE: Record<string, string> = { confidential: 'CONF', pii: 'PII', phi: 'PHI', pci: 'PCI', secret: 'SECRET' };

export function fanoutLabel(f: OpsDef['fanout']): string | undefined {
  if (f === undefined) return undefined;
  if (typeof f === 'number') return `×${f}`;
  return `×${f.min ?? 1}–${f.max}`;
}

/** Fan-out first (it changes the shape of the flow), then data sensitivity, trigger, budget. */
export function opsMarks(ops: OpsDef): string[] {
  return [
    fanoutLabel(ops.fanout),
    ops.data?.sensitivity && SENSITIVE[ops.data.sensitivity],
    ops.trigger && TRIGGER[ops.trigger.kind],
    ops.approval?.timeout && `≤${ops.approval.timeout}`,
    ops.budget?.usd !== undefined ? `$${ops.budget.usd}` : undefined,
  ].filter((x): x is string => !!x);
}

const show = (v: unknown) => (v === undefined || v === '' ? undefined : String(v));

/** Rows for the inspector "Operations" table (undefined rows are dropped by the table). */
export function opsRows(ops: OpsDef): Record<string, string | undefined> {
  const t = ops.trigger;
  const a = ops.approval;
  const b = ops.budget;
  const l = ops.limits;
  const r = ops.rollout;
  const s = ops.sandbox;
  return {
    trigger: t && [t.kind, t.schedule && `"${t.schedule}"`, t.source && `from ${t.source}`].filter(Boolean).join(' '),
    approval: a && [a.by ?? 'human', a.via && `via ${a.via}`, a.actions && `(${a.actions.join(' / ')})`,
      a.timeout && `within ${a.timeout}${a.on_timeout ? ` else ${a.on_timeout}` : ''}`].filter(Boolean).join(' '),
    budget: b && [b.usd !== undefined && `$${b.usd}`, b.tokens && `${b.tokens.toLocaleString()} tokens`, b.turns && `${b.turns} turns`,
      b.on_exceed && `→ ${b.on_exceed}`].filter(Boolean).join(' · '),
    'fan-out': fanoutLabel(ops.fanout) && `${fanoutLabel(ops.fanout)} parallel${typeof ops.fanout === 'object' && ops.fanout.by ? ` (by ${ops.fanout.by})` : ''}`,
    limits: l && [l.timeout && `timeout ${l.timeout}`, l.ttl && `ttl ${l.ttl}`, l.retries !== undefined && `${l.retries} retries`,
      l.backoff, l.max_iterations && `max ${l.max_iterations} rounds`, l.concurrency && `concurrency ${l.concurrency}`].filter(Boolean).join(' · '),
    sla: show(ops.sla),
    version: [ops.version, r && `${r.strategy}${r.percent !== undefined ? ` ${r.percent}%` : ''}${r.previous ? ` (from ${r.previous})` : ''}`].filter(Boolean).join(' · ') || undefined,
    credentials: show(ops.credentials),
    sandbox: s && [s.network && `network ${s.network}`, s.allow?.length && s.allow.join(', '), s.filesystem && `fs ${s.filesystem}`].filter(Boolean).join(' · '),
  };
}

/** Whether an eval meets its target (undefined when it cannot be compared). */
export function evalPasses(e: NonNullable<OpsDef['evals']>[number]): boolean | undefined {
  if (typeof e.value !== 'number' || typeof e.target !== 'number') return undefined;
  return e.higher_is_better === false ? e.value <= e.target : e.value >= e.target;
}
