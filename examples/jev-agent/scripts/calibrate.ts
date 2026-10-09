// Nightly calibration over logs/judgments.log. Joins each Jev judgment with the outcome
// that later labelled it, then reports Brier score, reliability bins and a threshold
// chosen on one half of the data and checked on the other (split-half, as pi-warden does).
// Usage: node scripts/calibrate.ts [logs/judgments.log] [--min-precision 0.8]
import { readFileSync } from 'node:fs';
import { argv } from 'node:process';

type Line = { ts: string; run: string; kind: string; decision: string; answers?: Record<string, { noul?: number }>; action?: string; reason?: string; outcome?: string };
// 1 = the intervention was right (hold declined, stop block led to real work, allowed call regretted).
const LABEL: Record<string, number> = { declined: 1, regretted: 1, useful: 1, approved: 0, wasted: 0 };
// Which question an outcome labels when the action's reason is not itself a question id.
const DEFAULT_QUESTION: Record<string, string> = { tool_risk: 'irreversible' };
const path = argv[2] && !argv[2].startsWith('--') ? argv[2] : 'logs/judgments.log';
const minPrecision = Number(argv[argv.indexOf('--min-precision') + 1]) || 0.8;
const lines: Line[] = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// Within a run, one decision writes judgment -> action -> (later) outcome. An action
// consumes the pending judgment (none for offline holds); an outcome labels the last action.
const samples = new Map<string, { p: number; y: number }[]>();
const actions = new Map<string, Map<string, number>>();
const precision = new Map<string, number[]>(); // decision.action -> labels
const pending = new Map<string, Line>();
const lastAction = new Map<string, { action: Line; judgment?: Line }>();
for (const l of lines) {
  const key = `${l.run}/${l.decision}`;
  if (l.kind === 'judgment') pending.set(key, l);
  if (l.kind === 'action') {
    const m = actions.get(l.decision) ?? new Map();
    m.set(l.action!, (m.get(l.action!) ?? 0) + 1);
    actions.set(l.decision, m);
    lastAction.set(key, { action: l, judgment: pending.get(key) });
    pending.delete(key);
  }
  const last = lastAction.get(key);
  if (l.kind === 'outcome' && l.outcome! in LABEL && last) {
    const y = LABEL[l.outcome!];
    const actId = `${l.decision}.${last.action.action}`;
    precision.set(actId, [...(precision.get(actId) ?? []), y]);
    const answers = last.judgment?.answers ?? {};
    const q = last.action.reason! in answers ? last.action.reason! : DEFAULT_QUESTION[l.decision];
    const p = q ? answers[q]?.noul : undefined;
    if (p !== undefined) samples.set(`${l.decision}.${q}`, [...(samples.get(`${l.decision}.${q}`) ?? []), { p, y }]);
    lastAction.delete(key);
  }
}

const brier = (s: { p: number; y: number }[]) => s.reduce((t, x) => t + (x.p - x.y) ** 2, 0) / s.length;
const precisionAt = (s: { p: number; y: number }[], t: number) => {
  const hit = s.filter((x) => x.p >= t);
  return hit.length ? hit.filter((x) => x.y === 1).length / hit.length : NaN;
};

for (const [id, s] of samples) {
  const bins = [0, 0.2, 0.4, 0.6, 0.8].map((lo) => {
    const b = s.filter((x) => x.p >= lo && x.p < lo + 0.2 + (lo === 0.8 ? 0.01 : 0));
    return `${lo.toFixed(1)}: ${b.length ? (b.filter((x) => x.y === 1).length / b.length).toFixed(2) : '-'} (n=${b.length})`;
  });
  const [a, b] = [s.filter((_, i) => i % 2 === 0), s.filter((_, i) => i % 2 === 1)];
  const t = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95].find((x) => precisionAt(a, x) >= minPrecision);
  console.log(`${id}  n=${s.length}  brier=${brier(s).toFixed(3)}`);
  console.log(`  observed rate by bin  ${bins.join('  ')}`);
  console.log(t === undefined
    ? `  no threshold reaches precision ${minPrecision} on the tuning half`
    : `  threshold ${t}: precision ${precisionAt(a, t).toFixed(2)} tune / ${precisionAt(b, t).toFixed(2)} holdout`);
}
for (const [decision, m] of actions) {
  const total = [...m.values()].reduce((x, y) => x + y, 0);
  console.log(`${decision}  ${[...m].map(([k, v]) => `${k}=${v} (${((1000 * v) / total).toFixed(1)}/1k)`).join('  ')}`);
}
for (const [id, ys] of precision) console.log(`${id}  labelled=${ys.length}  precision=${(ys.filter((y) => y === 1).length / ys.length).toFixed(2)}`);
console.log('Labels exist only where a human or a later event answered: held calls and blocked stops are over-represented.');
