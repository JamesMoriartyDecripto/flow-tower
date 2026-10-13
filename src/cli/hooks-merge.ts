/**
 * Pure merge of the shipped `integrations/` hook configs into a harness's settings file (#189,
 * step 1 of `flow-tower hooks install`). No file IO and no process state: the caller reads the
 * files and writes the result. The templates are the source of every entry, so the docs and the
 * installer cannot drift apart.
 */
import { hermesPort, mergeHermes as mergeHermesYaml, unmergeHermes as unmergeHermesYaml } from './hooks-merge-yaml.ts';

export type Harness = 'claude-code' | 'codex' | 'pi' | 'hermes';
export type JsonHarness = 'claude-code' | 'codex';
/** command: the full emit command prefix, e.g. '"/opt/node22/bin/node" "/x/bin/flow-tower.js" emit'. */
export interface WireOptions { port: number; command: string }
export interface MergeResult { text: string; changed: boolean; added: number; replaced: number; removed: number }

type Json = Record<string, unknown>;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const PI_URL_LINE = /^const URL = '[^']*';\r?$/m;
const PI_PORT = /^const URL = 'http:\/\/127\.0\.0\.1:(\d+)\/api\/events\?source=pi';/m;
const PI_NOTE = '// Installed by flow-tower hooks install: re-run it after changing the port.';

function checkPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port: ${port}`);
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parses a settings file. Errors never echo the file's text: it may hold tokens. */
function parseSettings(text: string | undefined): Json {
  if (text === undefined || text.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('settings file is not valid JSON; not overwriting it');
  }
  if (!isObject(value)) throw new Error('settings file must be a JSON object; not overwriting it');
  return value;
}

function hooksOf(root: Json): Json {
  const hooks = root.hooks;
  if (hooks === undefined) return {};
  if (!isObject(hooks)) throw new Error('"hooks" in the settings file must be an object; not overwriting it');
  return hooks;
}

function portOf(url: string): number | undefined {
  try {
    return Number(new URL(url).port) || undefined;
  } catch {
    return undefined;
  }
}

/** Ours = a loopback http hook on /api/events for this source, or a flow-tower emit command for it. */
function isOurHook(item: unknown, harness: Harness): boolean {
  if (!isObject(item)) return false;
  if (item.type === 'http' && typeof item.url === 'string') {
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      return false;
    }
    return LOOPBACK.has(url.hostname) && url.pathname.includes('/api/events')
      && url.searchParams.get('source') === harness;
  }
  if (item.type === 'command' && typeof item.command === 'string') {
    return item.command.includes('flow-tower')
      && new RegExp(`emit --source ${harness}(\\s|$)`).test(item.command);
  }
  return false;
}

/** Removes our hooks from one group. Returns undefined for a group left empty, so it is dropped. */
function dropOurs(group: unknown, harness: Harness): { group: unknown; dropped: number } {
  if (!isObject(group) || !Array.isArray(group.hooks)) return { group, dropped: 0 };
  const keep = group.hooks.filter((h) => !isOurHook(h, harness));
  const dropped = group.hooks.length - keep.length;
  if (dropped === 0) return { group, dropped: 0 };
  if (keep.length === 0) return { group: undefined, dropped };
  return { group: { ...group, hooks: keep }, dropped };
}

function wireGroup(group: unknown, harness: JsonHarness, o: WireOptions): unknown {
  if (!isObject(group) || !Array.isArray(group.hooks)) return group;
  const hooks = group.hooks.map((h): unknown => {
    if (!isObject(h)) return h;
    if (h.type === 'http') {
      return { ...h, url: `http://127.0.0.1:${o.port}/api/events?source=${harness}` };
    }
    if (h.type === 'command' && typeof h.command === 'string') {
      // A function replacement: the command may contain `$`, which a string replacement would expand.
      return { ...h, command: h.command.replace(/^flow-tower emit/, () => o.command) };
    }
    return { ...h };
  });
  return { ...group, hooks };
}

function serialize(root: Json): string {
  return JSON.stringify(root, null, 2) + '\n';
}

export function mergeJsonHooks(
  harness: JsonHarness,
  existing: string | undefined,
  template: string,
  o: WireOptions,
): MergeResult {
  checkPort(o.port);
  const root = parseSettings(existing);
  const hooks = hooksOf(root);
  const tplHooks = hooksOf(parseSettings(template));
  let replaced = 0;
  let added = 0;

  for (const [event, groups] of Object.entries(tplHooks)) {
    if (!Array.isArray(groups)) throw new Error(`template event ${event} must be a list`);
    const current = hooks[event];
    if (current !== undefined && !Array.isArray(current)) {
      throw new Error(`hooks.${event} must be a list; not overwriting it`);
    }
    // Ours go out and the template's come in at the end, so the user's entries keep their order.
    const kept: unknown[] = [];
    for (const group of current ?? []) {
      const r = dropOurs(group, harness);
      replaced += r.dropped;
      if (r.group !== undefined) kept.push(r.group);
    }
    for (const group of groups) {
      kept.push(wireGroup(group, harness, o));
      if (isObject(group) && Array.isArray(group.hooks)) added += group.hooks.length;
    }
    hooks[event] = kept;
  }
  root.hooks = hooks;

  const text = serialize(root);
  return { text, changed: text !== (existing ?? ''), added, replaced, removed: 0 };
}

export function unmergeJsonHooks(harness: JsonHarness, existing: string): MergeResult {
  const root = parseSettings(existing);
  const hooks = hooksOf(root);
  let removed = 0;

  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept: unknown[] = [];
    for (const group of groups) {
      const r = dropOurs(group, harness);
      removed += r.dropped;
      if (r.group !== undefined) kept.push(r.group);
    }
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) delete root.hooks;
  else root.hooks = hooks;

  // Nothing of ours found: hand the user's file back byte for byte, not reformatted.
  if (removed === 0) return { text: existing, changed: false, added: 0, replaced: 0, removed: 0 };
  const text = serialize(root);
  return { text, changed: text !== existing, added: 0, replaced: 0, removed };
}

export function piExtension(template: string, port: number): string {
  checkPort(port);
  if (!PI_URL_LINE.test(template)) throw new Error('pi template has no const URL line');
  const body = template.replace(PI_URL_LINE, () => `const URL = 'http://127.0.0.1:${port}/api/events?source=pi';`);
  return `${PI_NOTE}\n${body}`;
}

export function mergeHermes(existing: string | undefined, template: string, port: number): MergeResult {
  checkPort(port);
  return mergeHermesYaml(existing, template, port);
}

export function unmergeHermes(existing: string): MergeResult {
  return unmergeHermesYaml(existing);
}

/** The port our entries point at (for `hooks status`), or undefined when not wired. */
export function wiredPort(harness: Harness, text: string): number | undefined {
  if (harness === 'hermes') return hermesPort(text);
  if (harness === 'pi') {
    const m = PI_PORT.exec(text);
    return m ? Number(m[1]) : undefined;
  }
  let root: Json;
  try {
    root = parseSettings(text);
  } catch {
    return undefined;
  }
  let hooks: Json;
  try {
    hooks = hooksOf(root);
  } catch {
    return undefined;
  }
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) continue;
      for (const h of group.hooks) {
        if (isOurHook(h, harness) && isObject(h) && typeof h.url === 'string') {
          const port = portOf(h.url);
          if (port !== undefined) return port;
        }
      }
    }
  }
  return undefined;
}
