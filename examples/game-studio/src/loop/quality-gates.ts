import { loadConfig } from '../config';

/**
 * Numeric quality gates from config/quality-gates.yaml. Agents never decide
 * whether a build is "good enough": they report metrics, this file decides.
 *
 *   gates:
 *     performance:
 *       min: { fps_p5: 55, fps_avg: 60 }
 *       max: { frame_ms_p95: 18.5, memory_mb: 6144, hitch_count_per_min: 2 }
 *     playtest:
 *       min: { completion_rate: 0.6 }
 *       max: { crash_rate: 0.005, stuck_events_per_run: 1 }
 */
interface GateDef {
  description?: string;
  min?: Record<string, number>;
  max?: Record<string, number>;
  equals?: Record<string, string | number | boolean>;
  required?: string[];
}

interface QualityGatesFile { gates: Record<string, GateDef> }

export type Metrics = Record<string, number | string | boolean | undefined>;
export interface GateResult { pass: boolean; reasons: string[] }

let cache: QualityGatesFile | undefined;
const gates = () => (cache ??= loadConfig<QualityGatesFile>('quality-gates'));

export function checkGate(name: string, metrics: Metrics): GateResult {
  const gate = gates().gates[name];
  if (!gate) return { pass: false, reasons: [`unknown gate "${name}" (fail closed)`] };
  const reasons: string[] = [];

  for (const key of gate.required ?? []) {
    if (metrics[key] === undefined) reasons.push(`${key}: missing metric`);
  }
  for (const [key, min] of Object.entries(gate.min ?? {})) {
    const v = Number(metrics[key]);
    if (Number.isNaN(v)) reasons.push(`${key}: missing (needs >= ${min})`);
    else if (v < min) reasons.push(`${key}: ${v} < ${min}`);
  }
  for (const [key, max] of Object.entries(gate.max ?? {})) {
    const v = Number(metrics[key]);
    if (Number.isNaN(v)) reasons.push(`${key}: missing (needs <= ${max})`);
    else if (v > max) reasons.push(`${key}: ${v} > ${max}`);
  }
  for (const [key, want] of Object.entries(gate.equals ?? {})) {
    if (metrics[key] !== want) reasons.push(`${key}: ${String(metrics[key])} != ${String(want)}`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** Checks several gates at once; used by the release go/no-go summary. */
export function checkGates(names: string[], metrics: Metrics): Record<string, GateResult> {
  return Object.fromEntries(names.map((n) => [n, checkGate(n, metrics)]));
}

/** Markdown table for the human go/no-go request. */
export function gateReport(results: Record<string, GateResult>): string {
  const rows = Object.entries(results).map(([n, r]) => `| ${n} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.reasons.join('; ') || '-'} |`);
  return ['| Gate | Result | Reasons |', '|---|---|---|', ...rows].join('\n');
}
