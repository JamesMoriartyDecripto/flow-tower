/*
 * Tower values as printed text. A value becomes plain text, a list of pairs (label | value) or a list
 * of items. The key picks the shape first, so a budget reads as a sentence and everything else as
 * pairs. Pure: no DOM. Nothing is dropped: every leaf of the input reaches the output, only re-worded.
 */

export type FieldValue = { text: string } | { pairs: [string, string][] } | { list: string[] };

export interface Field {
  label: string;
  value: FieldValue;
}

/** `on_exceed` → `On exceed`, `maxTurns` → `Max turns`: the label a reader expects. */
export function humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A scalar as written: booleans read as yes/no, numbers and strings as they are. */
function scalar(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/**
 * Nested values flattened to words joined by `·`. Printed text never carries JSON: a reader gets
 * `stop · 3 retries`, not `{"on_exceed":"stop"}`.
 */
function flat(v: unknown): string {
  if (Array.isArray(v)) return v.map(flat).join(' · ');
  if (v !== null && typeof v === 'object') {
    return Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${k.replace(/_/g, ' ')}: ${flat(x)}`)
      .join(' · ');
  }
  return scalar(v);
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * One budget as a line: the money and its scope first (`$0.05 per run for model`), then the other
 * facts, then the description on its own line. Every key is kept.
 */
function budgetText(b: Record<string, unknown>): string {
  const used = new Set<string>(['per', 'for', 'description']);
  let money: string | undefined;
  if (b.usd !== undefined) {
    used.add('usd');
    money = `$${scalar(b.usd)}`;
  } else if (b.amount !== undefined) {
    used.add('amount');
    used.add('currency');
    money = [scalar(b.amount), b.currency === undefined ? '' : scalar(b.currency)].filter(Boolean).join(' ');
  }
  const head = [money, b.per !== undefined && `per ${scalar(b.per)}`, b.for !== undefined && `for ${scalar(b.for)}`]
    .filter(Boolean)
    .join(' ');
  const rest = Object.entries(b)
    .filter(([k, v]) => !used.has(k) && v !== undefined)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${flat(v)}`);
  const line = [head, ...rest].filter(Boolean).join(' · ');
  return b.description === undefined ? line : `${line}\n${scalar(b.description)}`;
}

/** A decision as `choice of: quickfix · full · needs_info · reject`; the other keys follow it. */
function decisionText(d: Record<string, unknown>): string {
  const { output, candidates, ...rest } = d;
  const head = candidates === undefined
    ? scalar(output ?? 'choice')
    : `${scalar(output ?? 'choice')} of: ${flat(candidates)}`;
  const tail = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${flat(v)}`);
  return [head, ...tail].join(' · ');
}

/** Any other object: one pair per key, humanised; a nested value is flattened into its pair. */
function pairsOf(o: Record<string, unknown>): [string, string][] {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [humanise(k), flat(v)]);
}

/**
 * The printable shape of one tower value. Known shapes first (budget, decision), then the fallback:
 * objects become pairs, arrays become lists, scalars become text.
 */
export function formatValue(key: string, value: unknown): FieldValue {
  if (key === 'budget') {
    if (Array.isArray(value) && value.every(isObject)) return { list: value.map(budgetText) };
    if (isObject(value)) return { text: budgetText(value) };
  }
  if (key === 'decision' && isObject(value) && (value.output !== undefined || value.candidates !== undefined)) {
    return { text: decisionText(value) };
  }
  if (Array.isArray(value)) return { list: value.map(flat) };
  if (isObject(value)) return { pairs: pairsOf(value) };
  return { text: scalar(value) };
}

/** The labelled fields of an object (its keys in their own order), with unset keys left out. */
export function fieldsOf(o: Record<string, unknown>): Field[] {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ label: humanise(k), value: formatValue(k, v) }));
}
