import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPath } from '../src/cli/library';
import { buildTower, loadLibrary } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Issue } from '../src/core/types';
import { cleanEnv } from './fixtures/clean-env';

describe('runtimes, resources, status', () => {
  const def = TowerSchema.parse({
    name: 'Hybrid',
    runtimes: { laptop: { kind: 'local' }, vps: { kind: 'server', host: 'vps-1', provider: 'hetzner' } },
    agents: { worker: { model: 'sonnet', runtime: 'vps', resources: [{ kind: 'log', label: 'Worker log', path: 'logs/w.log' }] } },
    layers: [{
      id: 'l', title: 'L',
      nodes: [
        { id: 'a', agent: 'worker' },
        { id: 'b', runtime: 'laptop', status: 'planned', resources: [{ kind: 'dashboard', label: 'Grafana', url: 'https://grafana.example.com' }] },
        { id: 'c', runtime: 'mars' },
      ],
      edges: ['a -> b', 'b -> c'],
    }],
  });

  it('inherits runtime and resources from the agent, validates refs', async () => {
    const issues: Issue[] = [];
    const t = await buildTower(def, 't', { read: async () => undefined }, issues);
    const [a, b, c] = t.layers[0].nodes;
    expect(a.runtime).toMatchObject({ id: 'vps', kind: 'server', host: 'vps-1' });
    expect(a.resources).toHaveLength(1);
    expect(a.status).toBe('active');
    expect(b).toMatchObject({ status: 'planned', runtime: { id: 'laptop' } });
    expect(c.runtime).toBeUndefined();
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', message: 'unknown runtime "mars"' }));
  });

  it('rejects non-http resource urls (no javascript: links)', () => {
    const bad = { name: 'x', layers: [{ id: 'l', title: 'L', nodes: [{ id: 'n', resources: [{ kind: 'doc', label: 'x', url: 'javascript:alert(1)' }] }] }] };
    expect(TowerSchema.safeParse(bad).success).toBe(false);
  });
});

describe('loadLibrary', () => {
  it('finds towers in a directory and separates projects from nested towers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ft-'));
    mkdirSync(join(dir, 'a', 'towers'), { recursive: true });
    mkdirSync(join(dir, 'b'));
    mkdirSync(join(dir, 'node_modules'));
    const tower = (name: string, extra = '') => `name: ${name}\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: n${extra} }\n`;
    writeFileSync(join(dir, 'a', 'a.tower.yaml'), tower('A', ', tower: towers/sub.tower.yaml'));
    writeFileSync(join(dir, 'a', 'towers', 'sub.tower.yaml'), tower('Sub'));
    writeFileSync(join(dir, 'b', 'b.tower.yaml'), tower('B'));
    writeFileSync(join(dir, 'node_modules', 'x.tower.yaml'), tower('Ignored'));

    const { workspace } = await loadLibrary([dir]);
    expect(workspace.projects).toEqual(['a/a.tower.yaml', 'b/b.tower.yaml']);
    expect(Object.keys(workspace.towers).sort()).toEqual(['a/a.tower.yaml', 'a/towers/sub.tower.yaml', 'b/b.tower.yaml']);
    expect(workspace.towers['a/a.tower.yaml'].layers[0].nodes[0].tower).toBe('a/towers/sub.tower.yaml');
  });

  it('referenced holds a node files entry, but watched does not (a docs edit must not reload)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ft-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'a.md'), 'hello');
    writeFileSync(join(dir, 'main.tower.yaml'), 'name: M\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: n, files: [docs/a.md] }\n');

    const lib = await loadLibrary([dir]);
    const doc = join(dir, 'docs', 'a.md');
    expect(lib.referenced.has(doc)).toBe(true);
    expect(lib.watched.has(doc)).toBe(false);
  });
});

/**
 * The user's own library (#121): a list of paths in the user folder's config.json, checked so nothing
 * from the flow-tower checkout, its examples/ or the user folder ends up in it.
 */
const CLI = resolve('bin/flow-tower.js');
const root = mkdtempSync(join(tmpdir(), 'flow-tower-library-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A throwaway folder under the shared temp root: each test gets its own tree. */
function folder(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const tower = (name: string) => `name: ${name}\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: n }\n`;

describe('checkPath (#121)', () => {
  const checkout = folder('checkout');
  const home = folder('home');
  mkdirSync(join(checkout, 'examples', 'demo'), { recursive: true });
  writeFileSync(join(checkout, 'examples', 'demo', 'demo.tower.yaml'), tower('Demo'));
  writeFileSync(join(checkout, 'mine.tower.yaml'), tower('Mine'));

  const check = (abs: string) => checkPath(abs, { checkout, home });

  it('accepts a tower file and a folder that holds one', () => {
    const project = folder('project');
    writeFileSync(join(project, 'a.tower.yaml'), tower('A'));
    expect(check(join(project, 'a.tower.yaml'))).toEqual({ ok: true });
    expect(check(project)).toEqual({ ok: true });
  });

  it('finds a tower up to 3 levels deep, skipping node_modules and .git', () => {
    const deep = folder('deep');
    mkdirSync(join(deep, 'one', 'two', 'three'), { recursive: true });
    writeFileSync(join(deep, 'one', 'two', 'three', 'x.tower.yaml'), tower('X'));
    expect(check(deep)).toEqual({ ok: true });

    const hidden = folder('hidden');
    mkdirSync(join(hidden, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(hidden, '.git'), { recursive: true });
    writeFileSync(join(hidden, 'node_modules', 'pkg', 'x.tower.yaml'), tower('X'));
    writeFileSync(join(hidden, '.git', 'y.tower.yaml'), tower('Y'));
    expect(check(hidden).ok).toBe(false);
  });

  it('refuses a path that does not exist, naming what to do', () => {
    const r = check(join(root, 'nowhere'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('does not exist');
  });

  it('accepts the tower suffix in any case, like the loader', () => {
    const project = folder('shouty');
    writeFileSync(join(project, 'APP.TOWER.YAML'), tower('App'));
    expect(check(join(project, 'APP.TOWER.YAML'))).toEqual({ ok: true });
    expect(check(project)).toEqual({ ok: true });
  });

  it('refuses a file that is not a *.tower.yaml', () => {
    const project = folder('not-a-tower');
    writeFileSync(join(project, 'notes.md'), 'hi');
    const r = check(join(project, 'notes.md'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('*.tower.yaml');
  });

  it('refuses a folder with no tower in its first 3 levels', () => {
    const empty = folder('empty');
    mkdirSync(join(empty, 'a', 'b'), { recursive: true });
    const r = check(empty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('no *.tower.yaml');
  });

  it('refuses anything under the checkout examples, pointing at flow-tower copy', () => {
    const r = check(join(checkout, 'examples', 'demo'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('flow-tower copy');
  });

  it('refuses anything inside the user folder: the loader never reads there', () => {
    writeFileSync(join(home, 'my.tower.yaml'), tower('Home'));
    const r = check(join(home, 'my.tower.yaml'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('user folder');
  });

  it('allows a tower inside the checkout but outside examples, with a commit warning', () => {
    const r = check(join(checkout, 'mine.tower.yaml'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toContain('flow-tower repo');
  });
});

describe('flow-tower library (#121)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-library-home-'));
  const project = mkdtempSync(join(tmpdir(), 'flow-tower-library-project-'));
  afterAll(() => { rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); });

  const library = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'library', ...args], { encoding: 'utf8', timeout: 20_000, env: cleanEnv({ FLOW_TOWER_HOME: home }) });
  const stored = () => JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).library as string[];

  writeFileSync(join(project, 'app.tower.yaml'), tower('App'));

  it('adds a path, then says it is already in', { timeout: 20_000 }, () => {
    const added = library('add', join(project, 'app.tower.yaml'));
    expect(added.status).toBe(0);
    expect(added.stdout).toContain('added:');
    expect(stored()).toEqual([join(project, 'app.tower.yaml')]);

    const again = library('add', join(project, 'app.tower.yaml'));
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('already in');
    expect(stored()).toHaveLength(1);
  });

  it('keeps other config keys when it writes', { timeout: 20_000 }, () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ viewers: ['alice@example.com'], library: [] }), { mode: 0o600 });
    library('add', project);
    const config = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')) as Record<string, unknown>;
    expect(config.viewers).toEqual(['alice@example.com']);
    expect(config.library).toEqual([project]);
  });

  it('refuses a path with a reason and exits 1', { timeout: 20_000 }, () => {
    // The file exists, so the refusal is the user-folder rule, not "does not exist".
    writeFileSync(join(home, 'inside.tower.yaml'), tower('Inside'));
    const r = library('add', join(home, 'inside.tower.yaml'));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('refused:');
    expect(r.stdout).toContain('user folder');
    expect(stored()).toEqual([project]);
  });

  it('lists each entry and marks a missing one', { timeout: 20_000 }, () => {
    // Added while it exists (checkPath refuses a missing path), then deleted: list must flag it.
    const gone = join(project, 'gone.tower.yaml');
    writeFileSync(gone, tower('Gone'));
    expect(library('add', gone).status).toBe(0);
    rmSync(gone);
    const list = library('list');
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(`${project}\n`);
    expect(list.stdout).toContain(`${gone}  missing`);
  });

  it('removes by resolved path or by the stored string', { timeout: 20_000 }, () => {
    // A redundant path segment still resolves to the same entry.
    const remove = library('remove', join(project, '.', 'gone.tower.yaml'));
    expect(remove.status).toBe(0);
    expect(remove.stdout).toContain('removed:');
    expect(stored()).toEqual([project]);

    expect(library('remove', project).status).toBe(0);
    expect(stored()).toEqual([]);

    const again = library('remove', project);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('not in the library');
  });

  it('hints when the list is empty', { timeout: 20_000 }, () => {
    const r = library('list');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('no towers yet');
  });

  it('exits 1 on a usage error', { timeout: 20_000 }, () => {
    expect(library('add').status).toBe(1);
    expect(library('frobnicate').status).toBe(1);
    expect(existsSync(join(home, 'config.json'))).toBe(true);
  });
});

/**
 * `flow-tower library` with no subcommand serves the user's own towers (#121b). Nothing here starts a
 * server: the empty-library refusal happens before Vite, so a spawned child exits on its own.
 */
describe('flow-tower library serve (#121b)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-library-serve-home-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20_000, env: cleanEnv({ FLOW_TOWER_HOME: home }) });

  it('exits 1 with the add hint when the library is empty', { timeout: 20_000 }, () => {
    const r = run('library');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('your library is empty: flow-tower library add <path to a .tower.yaml or a folder>');
  });

  it('lists the library subcommands in the usage text', { timeout: 20_000 }, () => {
    const help = run('library', '--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('library add');
    expect(help.stdout).toContain('--with-examples');

    // The bare usage text (no arguments at all) names them too.
    const bare = run();
    expect(bare.status).toBe(1);
    expect(bare.stdout).toContain('library add');
  });
});
