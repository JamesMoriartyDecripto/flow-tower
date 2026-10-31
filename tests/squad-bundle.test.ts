import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { installTower } from '../src/cli/squad-tower';
import { cleanEnv } from './fixtures/clean-env';

const CLI = resolve('bin/flow-tower.js');
// A hung CLI would otherwise block this process forever: the timeout lets the test fail instead of the run.
const run = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20_000, env: cleanEnv() });

// Every temp folder a test makes is recorded here and removed after the suite, so the runs leave nothing behind.
const made: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A fresh git repository in a temp folder, so every test starts from an empty project. */
function gitProject(files: Record<string, string> = {}): string {
  const dir = tempDir('squad-bundle-');
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' });
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

const nodePackage = {
  name: 'demo',
  scripts: { check: 'vitest run && tsc', typecheck: 'tsc --noEmit' },
  devDependencies: { vitest: '^3.0.0' },
};

describe('squad bundle (#330)', () => {
  it('installs the canonical Dev Squad tower: 8 layers, name and root set, validates clean (#330)', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    const r = run('squad', 'init', dir);
    expect(r.status, r.stderr).toBe(0);

    const squad = join(dir, 'tools', 'squad');
    const main = join(squad, 'squad.tower.yaml');
    const doc = parse(readFileSync(main, 'utf8'));
    // The name is the one squad.json names the tower by, so the live events and the file agree.
    expect(doc.name).toBe(JSON.parse(readFileSync(join(squad, 'squad.json'), 'utf8')).tower);
    expect(doc.root).toBe('dev-squad');
    const layers = (doc.layers as { id: string }[]).map((l) => l.id);
    // The 8 layers of examples/dev-squad, in order: a tower that lost one is not the canonical squad.
    expect(layers).toEqual(['intake', 'orchestration', 'specialists', 'quality', 'runner', 'setup', 'observe', 'models']);

    // The support files the tower points at, with the nested runner tower and the role prompts.
    for (const rel of ['towers/runner-loop.tower.yaml', 'roles/triage.md', 'squad.example.json', 'task-template.md', 'README.md']) {
      expect(existsSync(join(squad, 'dev-squad', rel)), rel).toBe(true);
    }
    // Exactly one main tower: the canonical one is never copied into the support folder.
    expect(existsSync(join(squad, 'dev-squad', 'dev-squad.tower.yaml'))).toBe(false);
    expect(readdirSyncSafe(join(squad, 'dev-squad')).filter((f) => f.endsWith('.tower.yaml'))).toEqual([]);

    const v = run('validate', main, '--json');
    const report = JSON.parse(v.stdout) as { towers?: { issues?: { level: string }[] }[] };
    const issues = (report.towers ?? []).flatMap((t) => t.issues ?? []).filter((i) => i.level === 'error' || i.level === 'warning');
    expect(issues).toEqual([]);
  });

  it('keeps an edited tower and bundle file on --force, and fills a missing bundle file', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);

    const squad = join(dir, 'tools', 'squad');
    const main = join(squad, 'squad.tower.yaml');
    const runner = join(squad, 'dev-squad', 'towers', 'runner-loop.tower.yaml');
    writeFileSync(main, 'version: 1\nname: Mine\n');
    writeFileSync(runner, '# my edit\n');
    rmSync(join(squad, 'dev-squad', 'roles', 'triage.md'));

    const forced = run('squad', 'init', dir, '--force');
    expect(forced.status, forced.stderr).toBe(0);
    expect(readFileSync(main, 'utf8')).toBe('version: 1\nname: Mine\n');
    expect(readFileSync(runner, 'utf8')).toBe('# my edit\n');
    expect(existsSync(join(squad, 'dev-squad', 'roles', 'triage.md'))).toBe(true);
  });

  it('installs only allowlisted files from the source and skips secrets, links and node_modules', () => {
    // A source folder with traps: a key, a symlink to a secret, node_modules, .git, and a stray folder.
    const source = tempDir('squad-tower-src-');
    const secret = join(source, 'secret.txt');
    writeFileSync(secret, 'OPENROUTER_API_KEY=sk-or-x\n');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'roles', 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(source, 'roles', 'node_modules', 'pkg', 'i.js'), '');
    mkdirSync(join(source, 'roles', '.git'), { recursive: true });
    writeFileSync(join(source, 'roles', '.git', 'HEAD'), 'ref\n');
    writeFileSync(join(source, 'roles', '.env'), 'OPENROUTER_API_KEY=sk-or-y\n');
    writeFileSync(join(source, 'roles', 'ok.md'), '# ok\n');
    symlinkSync(secret, join(source, 'roles', 'linked.md'));
    mkdirSync(join(source, 'stray'), { recursive: true });
    writeFileSync(join(source, 'stray', 'x.md'), '');
    writeFileSync(join(source, 'README.md'), '# r\n');

    const squad = tempDir('squad-tower-dst-');
    const out = installTower(source, squad, 'Demo "quoted"');
    expect(out.main).toBe(true);
    const bundle = join(squad, 'dev-squad');
    expect(existsSync(join(bundle, 'roles', 'ok.md'))).toBe(true);
    expect(existsSync(join(bundle, 'README.md'))).toBe(true);
    expect(existsSync(join(bundle, 'roles', '.env'))).toBe(false);
    expect(existsSync(join(bundle, 'roles', 'linked.md'))).toBe(false);
    expect(existsSync(join(bundle, 'roles', 'node_modules'))).toBe(false);
    expect(existsSync(join(bundle, 'roles', '.git'))).toBe(false);
    expect(existsSync(join(bundle, 'stray'))).toBe(false);
    // The name goes through the YAML document, so quotes survive and the main tower parses back to them.
    expect(parse(readFileSync(join(squad, 'squad.tower.yaml'), 'utf8')).name).toBe('Demo "quoted"');
  });

  it('refuses a tools/squad that is a symlink out of the repo, and writes nothing outside it', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    const outside = tempDir('squad-link-target-');
    mkdirSync(join(dir, 'tools'), { recursive: true });
    symlinkSync(outside, join(dir, 'tools', 'squad'));
    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a real folder');
    expect(readdirSyncSafe(outside)).toEqual([]);
  });

  it('refuses a bundle folder that is a symlink, and writes no bundle files through it', () => {
    // installTower is called directly: the bundle root is a link, so nothing may land in the outside folder.
    const source = tempDir('squad-tower-src2-');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'roles'), { recursive: true });
    writeFileSync(join(source, 'roles', 'ok.md'), '# ok\n');
    const squad = tempDir('squad-tower-dst2-');
    const outside = tempDir('squad-tower-outside-');
    symlinkSync(outside, join(squad, 'dev-squad'));
    expect(() => installTower(source, squad, 'Demo')).toThrow(/not a real folder/);
    expect(readdirSyncSafe(outside)).toEqual([]);
    expect(existsSync(join(squad, 'squad.tower.yaml'))).toBe(false);
  });

  it('refuses a symlinked or missing canonical main tower, and writes nothing (#330 review)', () => {
    // The canonical main is read before any write: a link or a missing file must leave the destination absent.
    const source = tempDir('squad-tower-src5-');
    const outside = tempDir('squad-tower-outside5-');
    writeFileSync(join(outside, 'real.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    symlinkSync(join(outside, 'real.yaml'), join(source, 'dev-squad.tower.yaml'));
    const squad = tempDir('squad-tower-dst5-');
    expect(() => installTower(source, squad, 'Demo')).toThrow(/not a regular file|missing or not a regular/);
    expect(existsSync(join(squad, 'squad.tower.yaml'))).toBe(false);
    expect(existsSync(join(squad, 'dev-squad'))).toBe(false);

    const missing = tempDir('squad-tower-src6-');
    const squad2 = tempDir('squad-tower-dst6-');
    expect(() => installTower(missing, squad2, 'Demo')).toThrow(/missing or not a regular/);
    expect(existsSync(join(squad2, 'squad.tower.yaml'))).toBe(false);
    expect(existsSync(join(squad2, 'dev-squad'))).toBe(false);
  });

  it('refuses a malformed canonical main tower without echoing its content', () => {
    const source = tempDir('squad-tower-src7-');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'name: [unclosed SENTINEL-CONTENT\n');
    const squad = tempDir('squad-tower-dst7-');
    let message = '';
    try { installTower(source, squad, 'Demo'); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('not a valid YAML mapping');
    expect(message).not.toContain('SENTINEL-CONTENT');
    expect(existsSync(join(squad, 'squad.tower.yaml'))).toBe(false);
  });

  it('refuses a nested folder inside the bundle that is a symlink', () => {
    const source = tempDir('squad-tower-src3-');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'roles', 'lib'), { recursive: true });
    writeFileSync(join(source, 'roles', 'lib', 'a.md'), '# a\n');
    const squad = tempDir('squad-tower-dst3-');
    const outside = tempDir('squad-tower-outside3-');
    mkdirSync(join(squad, 'dev-squad', 'roles'), { recursive: true });
    symlinkSync(outside, join(squad, 'dev-squad', 'roles', 'lib'));
    expect(() => installTower(source, squad, 'Demo')).toThrow(/not a real folder/);
    expect(readdirSyncSafe(outside)).toEqual([]);
  });

  it('skips a secret-named folder without reading inside it', () => {
    const source = tempDir('squad-tower-src4-');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'roles', '.ssh'), { recursive: true });
    writeFileSync(join(source, 'roles', '.ssh', 'notes.txt'), 'not a key, but the folder is a secret\n');
    mkdirSync(join(source, 'roles', 'keys.pem'), { recursive: true });
    writeFileSync(join(source, 'roles', 'keys.pem', 'a.txt'), '');
    writeFileSync(join(source, 'roles', 'ok.md'), '# ok\n');
    const squad = tempDir('squad-tower-dst4-');
    installTower(source, squad, 'Demo');
    const bundle = join(squad, 'dev-squad');
    expect(existsSync(join(bundle, 'roles', '.ssh'))).toBe(false);
    expect(existsSync(join(bundle, 'roles', 'keys.pem'))).toBe(false);
    expect(existsSync(join(bundle, 'roles', 'ok.md'))).toBe(true);
  });

  it('keeps the tower name from an edited squad.json on --force, even when the tower is missing', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    const file = join(squad, 'squad.json');
    const edited = JSON.parse(readFileSync(file, 'utf8'));
    edited.tower = 'Custom Name';
    writeFileSync(file, JSON.stringify(edited, null, 2));
    rmSync(join(squad, 'squad.tower.yaml'));

    const forced = run('squad', 'init', dir, '--force');
    expect(forced.status, forced.stderr).toBe(0);
    expect(parse(readFileSync(join(squad, 'squad.tower.yaml'), 'utf8')).name).toBe('Custom Name');
    expect(JSON.parse(readFileSync(file, 'utf8')).tower).toBe('Custom Name');
  });

  it('does not echo malformed squad.json content in the error (#330 review)', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    // The sentinel stands in for a credential in a broken file: the parser message must not carry it out.
    writeFileSync(join(squad, 'squad.json'), '{ "tower": "SENTINEL-SECRET-123", ');
    const r = run('squad', 'init', dir, '--force');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not valid JSON: fix or remove it, then run init again');
    expect(r.stderr).not.toContain('SENTINEL-SECRET-123');
    expect(r.stdout).not.toContain('SENTINEL-SECRET-123');
  });

  it('refuses a malformed squad.json before any write, and leaves the runner and .cli untouched', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    writeFileSync(join(squad, 'squad.json'), '{ "tower": ');
    writeFileSync(join(squad, '.cli'), '/old/checkout\n');
    rmSync(join(squad, 'run.mjs'));

    const r = run('squad', 'init', dir, '--force');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not valid JSON');
    expect(existsSync(join(squad, 'run.mjs'))).toBe(false);
    expect(readFileSync(join(squad, '.cli'), 'utf8')).toBe('/old/checkout\n');
  });

  it('takes the detected tower name when an edited squad.json has no usable tower (#330 review)', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    const expected = JSON.parse(readFileSync(join(squad, 'squad.json'), 'utf8')).tower as string;
    const file = join(squad, 'squad.json');
    const edited = JSON.parse(readFileSync(file, 'utf8'));
    delete edited.tower;
    writeFileSync(file, JSON.stringify(edited, null, 2));
    rmSync(join(squad, 'squad.tower.yaml'));

    const forced = run('squad', 'init', dir, '--force');
    expect(forced.status, forced.stderr).toBe(0);
    const name = parse(readFileSync(join(squad, 'squad.tower.yaml'), 'utf8')).name;
    expect(typeof name).toBe('string');
    expect(name).toBe(expected);
  });

  it('refuses a runner file that is a symlink, and writes nothing outside the repo', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    const outside = tempDir('squad-runner-link-');
    const target = join(outside, 'steps.sh');
    writeFileSync(target, 'keep\n');
    rmSync(join(squad, 'steps.sh'));
    symlinkSync(target, join(squad, 'steps.sh'));

    const r = run('squad', 'init', dir, '--force');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a regular file');
    expect(readFileSync(target, 'utf8')).toBe('keep\n');
  });

  it('refuses a dangling .cli symlink without writing through it', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    const outside = tempDir('squad-cli-link-');
    const target = join(outside, 'created-by-init');
    rmSync(join(squad, '.cli'));
    symlinkSync(target, join(squad, '.cli'));

    const r = run('squad', 'init', dir, '--force');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a regular file');
    expect(existsSync(target)).toBe(false);
  });

  it('refuses a tasks folder that is a symlink, and writes nothing through it', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const squad = join(dir, 'tools', 'squad');
    const outside = tempDir('squad-tasks-link-');
    rmSync(join(squad, 'tasks'), { recursive: true, force: true });
    symlinkSync(outside, join(squad, 'tasks'));

    const r = run('squad', 'init', dir, '--force');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a real folder');
    expect(readdirSyncSafe(outside)).toEqual([]);
  });

  it('refuses a .gitignore that is a symlink before any file is written', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    const outside = tempDir('squad-gitignore-link-');
    const target = join(outside, 'ignore.txt');
    writeFileSync(target, 'keep\n');
    symlinkSync(target, join(dir, '.gitignore'));

    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a regular file');
    expect(readFileSync(target, 'utf8')).toBe('keep\n');
    // The preflight runs first, so the runner that would have been copied before the .gitignore step is absent.
    expect(existsSync(join(dir, 'tools', 'squad', 'run.mjs'))).toBe(false);
  });
});

/** Lists a folder, or nothing when it is missing, so a test can assert on file names. */
function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
