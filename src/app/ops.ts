import type { BudgetItem, LimitsDef, OpsDef } from '../core/schema';

/** Short, uppercase markers for a node subtitle, most important first. */

const TRIGGER: Record<string, string> = {
  manual: 'MANUAL', cron: 'CRON', webhook: 'WEBHOOK', event: 'EVENT', queue: 'QUEUE', chat: 'CHAT', email: 'EMAIL', file: 'FILE',
};
const SENSITIVE: Record<string, string> = { confidential: 'CONF', pii: 'PII', phi: 'PHI', pci: 'PCI', biometric: 'BIO', secret: 'SECRET' };
const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

const list = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function fanoutLabel(f: OpsDef['fanout']): string | undefined {
  if (f === undefined) return undefined;
  if (typeof f === 'number') return `×${f}`;
  return `×${f.min ?? 1}–${f.max}`;
}

/** "$2", "€150/month", "40k tokens" */
export function money(b: BudgetItem): string | undefined {
  const amount = b.usd ?? b.amount;
  if (amount === undefined) return undefined;
  const code = b.usd !== undefined ? 'USD' : (b.currency ?? 'USD');
  const per = b.per && b.per !== 'call' && b.per !== 'run' ? `/${b.per}` : '';
  return `${SYMBOL[code] ?? `${code} `}${amount.toLocaleString()}${per}`;
}

/** Fan-out first (it changes the shape of the flow), then data sensitivity, trigger, deadlines, money, guarantees. */
export function opsMarks(ops: OpsDef): string[] {
  return [
    fanoutLabel(ops.fanout),
    ops.data?.sensitivity && SENSITIVE[ops.data.sensitivity],
    ops.trigger && TRIGGER[ops.trigger.kind],
    ops.approval?.timeout && `≤${ops.approval.timeout}`,
    list(ops.budget).map(money).find(Boolean),
    ops.exactly_once && '1×',
    ops.async && (ops.async.mode === 'poll' ? 'POLL' : 'ASYNC'),
  ].filter((x): x is string => !!x);
}

const show = (v: unknown) => (v === undefined || v === '' ? undefined : String(v));
const join = (parts: unknown[], sep = ' ') => parts.filter((p) => p !== undefined && p !== false && p !== '').join(sep) || undefined;

function budgetText(b: BudgetItem) {
  return join([b.for && `${b.for}:`, money(b), b.tokens && `${b.tokens.toLocaleString()} tokens`, b.turns && `${b.turns} turns`,
    b.per === 'run' && 'per run', b.rate && `(${b.rate})`, b.on_exceed && `→ ${b.on_exceed}`, b.description && `— ${b.description}`]);
}

export function limitsText(l: LimitsDef | undefined) {
  if (!l) return undefined;
  return join([l.timeout && `timeout ${l.timeout}`, l.ttl && `ttl ${l.ttl}`, l.retries !== undefined && `${l.retries} retries`, l.backoff,
    l.max_iterations && `max ${l.max_iterations} rounds`, l.concurrency && `concurrency ${l.concurrency}`,
    list(l.rate).length > 0 && `quota ${list(l.rate).join(', ')}`, l.description], ' · ');
}

export function budgetsText(b: OpsDef['budget']) {
  return list(b).map(budgetText).filter(Boolean).join(' · ') || undefined;
}

function slaText(s: OpsDef['sla']) {
  if (s === undefined || typeof s === 'string') return show(s);
  return join([s.within, s.business && 'business', s.after && `after ${s.after}`, s.before && `before ${s.before}`, s.by && `by ${s.by}`,
    s.external && '(external wait)', s.description && `— ${s.description}`]);
}

function fanoutText(f: OpsDef['fanout']) {
  const label = fanoutLabel(f);
  if (!label) return undefined;
  if (typeof f !== 'object') return `${label} parallel`;
  return join([`${label} parallel`, f.by && `by ${list(f.by).join(' × ')}`, f.from && `from ${f.from.join(', ')}`, f.pick && `(${f.pick})`]);
}

/** Rows for the inspector "Operations" table (undefined rows are dropped by the table). */
export function opsRows(ops: OpsDef): Record<string, string | undefined> {
  const t = ops.trigger;
  const a = ops.approval;
  const r = ops.rollout;
  const s = ops.sandbox;
  const d = ops.decision;
  return {
    trigger: t && join([t.kind, t.schedule && `"${t.schedule}"`, t.hours, t.timezone && `(${t.timezone})`, t.source && `from ${t.source}`]),
    approval: a && join([a.by ?? 'human', a.when && `when ${a.when}`, a.per && `per ${a.per}`, list(a.via).length > 0 && `via ${list(a.via).join(' / ')}`,
      a.relayed_by && `relayed by ${a.relayed_by}`, a.actions && `(${a.actions.join(' / ')})`, a.rounds && `${a.rounds} revision rounds`,
      a.timeout && `within ${a.timeout}${a.on_timeout ? ` else ${a.on_timeout}` : ''}`, a.escalate_to && `→ ${a.escalate_to}`]),
    decision: d && join([d.output, d.candidates && `{${d.candidates.join(', ')}}`, d.threshold !== undefined && `threshold ${d.threshold}`,
      d.confidence && 'with confidence', d.model && `model ${d.model}`, d.fail && `fail-${d.fail}`, d.description && `— ${d.description}`]),
    budget: budgetsText(ops.budget),
    'fan-out': fanoutText(ops.fanout),
    limits: limitsText(ops.limits),
    async: ops.async && join([ops.async.mode, ops.async.interval && `every ${ops.async.interval}`, ops.async.timeout && `timeout ${ops.async.timeout}`, ops.async.description]),
    'exactly once': ops.exactly_once ? 'yes: never repeated, retries are idempotent' : undefined,
    sla: slaText(ops.sla),
    version: join([ops.version, r && join([r.strategy, r.percent !== undefined && `${r.percent}%`, r.steps && `steps ${r.steps.map((x) => `${x}%`).join(' → ')}`,
      r.arms && `arms ${r.arms.join(' vs ')}`, r.metric && `on ${r.metric}`, r.guard && `halt if ${r.guard}`, r.sample !== undefined && `sample ${r.sample}`,
      r.previous && `(from ${r.previous})`])], ' · '),
    credentials: show(ops.credentials),
    sandbox: s && join([s.network && `network ${s.network}`, s.allow?.length && s.allow.join(', '), s.filesystem && `fs ${s.filesystem}`], ' · '),
  };
}

/** Rows for the inspector "Data" table. */
export function dataRows(data: OpsDef['data']): Record<string, string | undefined> {
  if (!data) return {};
  return {
    region: data.region,
    retention: data.retention === 'none' ? 'none (in memory only)' : join([data.retention, data.retention_after && `after ${data.retention_after}`]),
    'lawful basis': data.lawful_basis?.replace(/_/g, ' '),
    disclosure: data.disclosure?.join(', '),
  };
}

/** Whether an eval meets its target (undefined when it cannot be compared). */
export function evalPasses(e: NonNullable<OpsDef['evals']>[number]): boolean | undefined {
  if (typeof e.value !== 'number' || typeof e.target !== 'number') return undefined;
  return e.higher_is_better === false ? e.value <= e.target : e.value >= e.target;
}
