/**
 * Hermes half of `flow-tower hooks install` (#189): merges the outbound webhook into
 * ~/.hermes/config.yaml. The yaml Document API keeps the user's comments and order, which a
 * parse-and-stringify round trip would lose. Pure: the caller does the file IO.
 */
import { type Document, isMap, isSeq, parseDocument, type YAMLSeq } from 'yaml';
import type { MergeResult } from './hooks-merge.ts';

const NAME = 'flow-tower';

interface OutboundItem { name?: unknown; url?: unknown; [key: string]: unknown }

/** Parses a config, refusing a broken file: a partial parse would drop the user's hooks on write. */
function parseChecked(text: string): Document {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    // Only the line is reported: the yaml error text can quote the user's secrets.
    const line = doc.errors[0].linePos?.[0].line ?? 0;
    throw new Error(`hermes config is not valid YAML (line ${line}); not overwriting it`);
  }
  return doc;
}

/** Ours = the outbound item named flow-tower (the name the shipped template gives it). */
function isOurs(item: unknown): boolean {
  return isMap(item) && item.get('name') === NAME;
}

function outbound(doc: Document): YAMLSeq | undefined {
  const seq = doc.getIn(['hooks', 'outbound']);
  if (seq === undefined) return undefined;
  if (!isSeq(seq)) throw new Error('hooks.outbound in the hermes config is not a list; not overwriting it');
  return seq;
}

export function mergeHermes(existing: string | undefined, template: string, port: number): MergeResult {
  const text = existing ?? '';
  const doc = parseChecked(text);

  // toJSON drops the template's warning comment, so it never reaches the user's file.
  const tpl = parseChecked(template).toJSON() as { hooks?: { outbound?: OutboundItem[] } };
  const source = tpl.hooks?.outbound?.find((i) => i.name === NAME);
  if (!source) throw new Error('hermes template has no flow-tower outbound item');
  const wired: OutboundItem = {
    ...source,
    url: String(source.url).replace(/^http:\/\/127\.0\.0\.1:\d+/, () => `http://127.0.0.1:${port}`),
  };

  const seq = outbound(doc);
  if (!seq) {
    doc.setIn(['hooks', 'outbound'], [wired]);
    return { text: doc.toString(), changed: true, added: 1, replaced: 0, removed: 0 };
  }

  // Replace at the first of ours so the user's items keep their place; extra copies of ours go.
  const indexes = seq.items.flatMap((item, i) => (isOurs(item) ? [i] : []));
  if (indexes.length === 0) {
    seq.items.push(doc.createNode(wired));
    const out = doc.toString();
    return { text: out, changed: out !== text, added: 1, replaced: 0, removed: 0 };
  }
  const [first, ...extra] = indexes;
  seq.items[first] = doc.createNode(wired);
  for (const i of extra.reverse()) seq.items.splice(i, 1);
  const out = doc.toString();
  return { text: out, changed: out !== text, added: 1, replaced: indexes.length, removed: 0 };
}

export function unmergeHermes(existing: string): MergeResult {
  const doc = parseChecked(existing);
  const seq = outbound(doc);
  if (!seq) return { text: existing, changed: false, added: 0, replaced: 0, removed: 0 };

  const before = seq.items.length;
  seq.items = seq.items.filter((item) => !isOurs(item));
  const removed = before - seq.items.length;
  // Nothing of ours found: hand the user's file back byte for byte.
  if (removed === 0) return { text: existing, changed: false, added: 0, replaced: 0, removed: 0 };

  if (seq.items.length === 0) doc.deleteIn(['hooks', 'outbound']);
  const hooks = doc.get('hooks');
  if (isMap(hooks) && hooks.items.length === 0) doc.delete('hooks');

  const out = doc.toString();
  return { text: out, changed: out !== existing, added: 0, replaced: 0, removed };
}

/** Port our Hermes item points at, or undefined when it is not wired (for `hooks status`). */
export function hermesPort(text: string): number | undefined {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return undefined;
  const seq = doc.getIn(['hooks', 'outbound']);
  if (!isSeq(seq)) return undefined;
  for (const item of seq.items) {
    if (!isOurs(item) || !isMap(item)) continue;
    try {
      const port = new URL(String(item.get('url'))).port;
      if (port) return Number(port);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
