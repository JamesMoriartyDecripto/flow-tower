import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  mergeHermes,
  mergeJsonHooks,
  piExtension,
  unmergeHermes,
  unmergeJsonHooks,
  wiredPort,
} from '../src/cli/hooks-merge.ts';

const read = (p: string) => readFileSync(new URL(`../integrations/${p}`, import.meta.url), 'utf8');
const claudeTpl = read('claude-code/settings.json');
const codexTpl = read('codex/hooks.json');
const piTpl = read('pi/flow-tower.ts');
const hermesTpl = read('hermes/config.yaml');

const CMD = '"/opt/node22/bin/node" "/x/bin/flow-tower.js" emit';
const opts = (port = 5317) => ({ port, command: CMD });

type Settings = { hooks?: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]>; [k: string]: unknown };
const parse = (text: string) => JSON.parse(text) as Settings;

const USER_HOOK = { matcher: 'Bash', hooks: [{ type: 'command', command: './lint.sh' }] };

describe('mergeJsonHooks: Claude Code', () => {
  it('wires all 11 events on an empty file', () => {
    const r = mergeJsonHooks('claude-code', undefined, claudeTpl, opts(6000));
    const s = parse(r.text);
    expect(Object.keys(s.hooks ?? {})).toHaveLength(11);
    expect(r.added).toBe(11);
    expect(r.changed).toBe(true);
    expect(s.hooks?.PreToolUse?.[0].hooks[0]).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:6000/api/events?source=claude-code',
      timeout: 2,
    });
    expect(s.hooks?.SessionStart?.[0].hooks[0]).toMatchObject({ type: 'command', command: `${CMD} --source claude-code`, async: true });
  });

  it('keeps the user hook and unrelated keys, in order', () => {
    const existing = JSON.stringify({ model: 'x', hooks: { PreToolUse: [USER_HOOK] } });
    const s = parse(mergeJsonHooks('claude-code', existing, claudeTpl, opts()).text);
    expect(s.model).toBe('x');
    expect(s.hooks?.PreToolUse).toHaveLength(2);
    expect(s.hooks?.PreToolUse?.[0]).toEqual(USER_HOOK);
  });

  it('replaces an old hand-made entry on the same port instead of duplicating it', () => {
    const old = { hooks: { Stop: [{ hooks: [{ type: 'http', url: 'http://127.0.0.1:5317/api/events?source=claude-code', timeout: 5 }] }] } };
    const r = mergeJsonHooks('claude-code', JSON.stringify(old), claudeTpl, opts());
    expect(r.replaced).toBe(1);
    expect(parse(r.text).hooks?.Stop).toHaveLength(1);
  });

  it('is idempotent', () => {
    const first = mergeJsonHooks('claude-code', undefined, claudeTpl, opts());
    const second = mergeJsonHooks('claude-code', first.text, claudeTpl, opts());
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it('a port change updates only our entries', () => {
    const existing = JSON.stringify({ model: 'x', hooks: { PreToolUse: [USER_HOOK] } });
    const first = mergeJsonHooks('claude-code', existing, claudeTpl, opts(5317));
    const moved = mergeJsonHooks('claude-code', first.text, claudeTpl, opts(5400));
    const s = parse(moved.text);
    expect(s.model).toBe('x');
    expect(s.hooks?.PreToolUse?.[0]).toEqual(USER_HOOK);
    expect(wiredPort('claude-code', moved.text)).toBe(5400);
  });

  it('unmerge leaves only the user hook and key', () => {
    const existing = JSON.stringify({ model: 'x', hooks: { PreToolUse: [USER_HOOK] } });
    const wired = mergeJsonHooks('claude-code', existing, claudeTpl, opts()).text;
    const r = unmergeJsonHooks('claude-code', wired);
    expect(parse(r.text)).toEqual({ model: 'x', hooks: { PreToolUse: [USER_HOOK] } });
    expect(r.removed).toBe(11);
  });

  it('refuses invalid JSON and a non-object file', () => {
    expect(() => mergeJsonHooks('claude-code', '{ nope', claudeTpl, opts())).toThrow(/not valid JSON/);
    expect(() => mergeJsonHooks('claude-code', '[1]', claudeTpl, opts())).toThrow(/JSON object/);
  });
});

describe('mergeJsonHooks: Codex', () => {
  it('wires the command hooks with the matcher and keeps the user hook', () => {
    const existing = JSON.stringify({ hooks: { Stop: [USER_HOOK] } });
    const r = mergeJsonHooks('codex', existing, codexTpl, opts());
    const s = parse(r.text);
    expect(s.hooks?.Stop).toHaveLength(2);
    expect(s.hooks?.Stop?.[0]).toEqual(USER_HOOK);
    expect(s.hooks?.Stop?.[1].matcher).toBe('.*');
    expect(s.hooks?.Stop?.[1].hooks[0]).toMatchObject({ command: `${CMD} --source codex` });
  });

  it('is idempotent', () => {
    const first = mergeJsonHooks('codex', undefined, codexTpl, opts());
    expect(mergeJsonHooks('codex', first.text, codexTpl, opts()).changed).toBe(false);
  });

  it('unmerge keeps the user hook', () => {
    const wired = mergeJsonHooks('codex', JSON.stringify({ hooks: { Stop: [USER_HOOK] } }), codexTpl, opts()).text;
    expect(parse(unmergeJsonHooks('codex', wired).text)).toEqual({ hooks: { Stop: [USER_HOOK] } });
  });

  it('does not treat a Claude Code entry as ours for Codex', () => {
    const claude = mergeJsonHooks('claude-code', undefined, claudeTpl, opts()).text;
    expect(unmergeJsonHooks('codex', claude).changed).toBe(false);
  });
});

describe('piExtension', () => {
  it('rewrites only the URL line and adds the note', () => {
    const out = piExtension(piTpl, 7001);
    expect(out.split('\n')[0]).toMatch(/^\/\/ Installed by flow-tower hooks install/);
    expect(out).toContain("const URL = 'http://127.0.0.1:7001/api/events?source=pi';");
    expect(out.replace(/^\/\/ Installed by.*\n/, '').replace("'http://127.0.0.1:7001/api/events?source=pi'", "'http://127.0.0.1:5317/api/events?source=pi'")).toBe(piTpl);
  });
});

describe('Hermes', () => {
  const userYaml = [
    '# my config',
    'hooks:',
    '  outbound:',
    '    - name: slack',
    '      url: https://example.com/hook',
    '',
  ].join('\n');

  it('keeps the user comment and item, and adds ours', () => {
    const r = mergeHermes(userYaml, hermesTpl, 6100);
    expect(r.text).toContain('# my config');
    expect(r.text).toContain('name: slack');
    expect(r.text).toContain('http://127.0.0.1:6100/api/events?source=hermes');
    expect(r.text).not.toContain('Merge into');
    expect(r.added).toBe(1);
  });

  it('replaces ours on the second merge', () => {
    const first = mergeHermes(userYaml, hermesTpl, 6100);
    const second = mergeHermes(first.text, hermesTpl, 6200);
    expect(second.replaced).toBe(1);
    expect(second.text.match(/name: flow-tower/g)).toHaveLength(1);
    expect(second.text).toContain('name: slack');
    expect(wiredPort('hermes', second.text)).toBe(6200);
  });

  it('is idempotent', () => {
    const first = mergeHermes(userYaml, hermesTpl, 6100);
    expect(mergeHermes(first.text, hermesTpl, 6100).changed).toBe(false);
  });

  it('unmerge removes only ours', () => {
    const wired = mergeHermes(userYaml, hermesTpl, 6100).text;
    const r = unmergeHermes(wired);
    expect(r.removed).toBe(1);
    expect(r.text).toContain('name: slack');
    expect(r.text).toContain('# my config');
    expect(r.text).not.toContain('flow-tower');
  });

  it('refuses invalid YAML', () => {
    expect(() => mergeHermes('hooks: [', hermesTpl, 5317)).toThrow(/not valid YAML/);
  });
});

describe('wiredPort', () => {
  it('is undefined when not wired', () => {
    expect(wiredPort('claude-code', '{}')).toBeUndefined();
    expect(wiredPort('codex', '')).toBeUndefined();
    expect(wiredPort('pi', 'const x = 1;')).toBeUndefined();
    expect(wiredPort('hermes', 'hooks: {}')).toBeUndefined();
  });

  it('reads the port for each harness', () => {
    expect(wiredPort('codex', mergeJsonHooks('codex', undefined, codexTpl, opts(5555)).text)).toBeUndefined();
    expect(wiredPort('claude-code', mergeJsonHooks('claude-code', undefined, claudeTpl, opts(5555)).text)).toBe(5555);
    expect(wiredPort('pi', piExtension(piTpl, 5556))).toBe(5556);
    expect(wiredPort('hermes', mergeHermes(undefined, hermesTpl, 5557).text)).toBe(5557);
  });
});
