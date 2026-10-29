import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { detectConfig } from '../src/cli/squad';
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
  const dir = tempDir('squad-init-');
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

describe('squad init (#265)', () => {
  it('sets a Node project up: runner, squad.json, tower, gitignore', { timeout: 30_000 }, () => {
    const dir = gitProject({
      'package.json': JSON.stringify(nodePackage),
      'tsconfig.json': '{}',
      'src/index.ts': 'export {};\n',
      'tests/a.test.ts': '',
    });
    const r = run('squad', 'init', dir);
    expect(r.status, r.stderr).toBe(0);

    const squad = join(dir, 'tools', 'squad');
    const config = JSON.parse(readFileSync(join(squad, 'squad.json'), 'utf8'));
    expect(config.commands.check).toBe('npm run check');
    expect(config.commands.test).toBe('npx vitest run {file}');
    expect(config.write).toEqual(['src', 'tests']);
    expect(config.review).toEqual(['src']);

    expect(existsSync(join(squad, 'run.mjs'))).toBe(true);
    expect(existsSync(join(squad, 'steps.sh'))).toBe(true);
    expect(existsSync(join(squad, 'config.mjs'))).toBe(true);
    expect(statSync(join(squad, 'steps.sh')).mode & 0o111).not.toBe(0);
    // Logs and the kit folder are not part of the runner.
    expect(existsSync(join(squad, 'kit'))).toBe(false);
    expect(readdirSyncSafe(squad).some((f) => f.endsWith('.log'))).toBe(false);

    const tower = join(squad, 'squad.tower.yaml');
    const v = run('validate', tower, '--json');
    const report = JSON.parse(v.stdout) as { towers?: { issues?: { level: string }[] }[] };
    const errors = (report.towers ?? []).flatMap((t) => t.issues ?? []).filter((i) => i.level === 'error');
    expect(errors).toEqual([]);

    const ignore = readFileSync(join(dir, '.gitignore'), 'utf8').split('\n');
    expect(ignore.filter((l) => l === 'tools/squad/*.log')).toHaveLength(1);
    expect(ignore.filter((l) => l === 'tools/squad/.cli')).toHaveLength(1);
    expect(ignore.filter((l) => l === 'tools/squad/tasks/*')).toHaveLength(1);
    expect(ignore.filter((l) => l === '!tools/squad/tasks/TEMPLATE.md')).toHaveLength(1);
  });

  it('refuses a second init, and --force keeps an edited squad.json', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);

    const again = run('squad', 'init', dir);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already set up');

    const file = join(dir, 'tools', 'squad', 'squad.json');
    const edited = JSON.parse(readFileSync(file, 'utf8'));
    edited.write = ['lib'];
    writeFileSync(file, JSON.stringify(edited, null, 2));

    const forced = run('squad', 'init', dir, '--force');
    expect(forced.status, forced.stderr).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).write).toEqual(['lib']);
  });

  it('detects a Python project from pyproject.toml', () => {
    const dir = gitProject({ 'pyproject.toml': '[project]\nname = "x"\n' });
    const { config } = detectConfig(dir) as { config: { commands: Record<string, string>; project: string } };
    // The interpreter is python3 wherever python3 is on PATH (#265 review): either name is right, the pytest call is the same.
    expect(config.commands.check).toMatch(/^python3? -m pytest$/);
    expect(config.commands.test).toMatch(/^python3? -m pytest \{file\}$/);
    expect(config.project).toMatch(/\(Python\)$/);
  });

  it('finds no check for a placeholder npm test script', { timeout: 30_000 }, () => {
    const dir = gitProject({
      'package.json': JSON.stringify({ name: 'bare', scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    });
    const { config } = detectConfig(dir) as { config: { commands: Record<string, string> } };
    expect(config.commands.check).toBeUndefined();

    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no check command found');
  });

  it('lets --check win over the detected command', () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage) });
    const { config } = detectConfig(dir, 'make ci') as { config: { commands: Record<string, string> } };
    expect(config.commands.check).toBe('make ci');
  });

  it('refuses a folder that is not a git repository', { timeout: 30_000 }, () => {
    const dir = tempDir('squad-plain-');
    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a git repository');
  });

  it('uses the current branch as base when there is no origin', () => {
    // git init -b names the only branch: with no origin, base must follow it, not assume main.
    const dir = tempDir('squad-base-');
    expect(spawnSync('git', ['init', '-q', '-b', 'master', dir], { encoding: 'utf8' }).status).toBe(0);
    const { config } = detectConfig(dir, 'make ci') as { config: { base: string } };
    expect(config.base).toBe('master');
  });

  it('makes a scripts-only project writable and reviewable without editing squad.json', () => {
    const dir = gitProject({ 'scripts/build.mjs': 'export {};\n' });
    const { config, notes } = detectConfig(dir, 'make ci') as { config: { write: string[]; review: string[] }; notes: string[] };
    expect(config.write).toEqual(['scripts']);
    expect(config.review).toEqual(['scripts']);
    expect(notes.join('\n')).not.toContain('edit tools/squad/squad.json');
  });

  it('installs the flow-tower-squad skill with the others for claude', { timeout: 30_000 }, () => {
    // HOME is a temp folder, so install-skill writes to ~/.claude there and never to the developer's home.
    const fakeHome = tempDir('squad-skill-home-');
    const r = spawnSync(process.execPath, [CLI, 'install-skill', '--target', 'claude'], {
      encoding: 'utf8', timeout: 20_000, env: cleanEnv({ HOME: fakeHome }),
    });
    expect(r.status, r.stderr).toBe(0);
    const md = readFileSync(join(fakeHome, '.claude', 'skills', 'flow-tower-squad', 'SKILL.md'), 'utf8');
    expect(md).not.toContain('{{FLOW_TOWER_CLI}}');
    expect(md).toContain(`node ${CLI} squad init`);
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('keeps the checkout path out of squad.json: it goes to the git-ignored .cli', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);

    const squad = join(dir, 'tools', 'squad');
    const config = JSON.parse(readFileSync(join(squad, 'squad.json'), 'utf8'));
    expect(config).not.toHaveProperty('cli');
    expect(readFileSync(join(squad, '.cli'), 'utf8').trim()).toBe(resolve('bin/flow-tower.js'));

    const ignore = readFileSync(join(dir, '.gitignore'), 'utf8').split('\n');
    expect(ignore).toContain('tools/squad/.cli');
  });

  it('bases the squad on main, not on the feature branch it was set up from', () => {
    // A feature branch as the base would make every diff empty: main (a local branch, no origin) must win.
    const dir = tempDir('squad-main-');
    const git = (...args: string[]) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
    expect(spawnSync('git', ['init', '-q', '-b', 'main', dir], { encoding: 'utf8' }).status).toBe(0);
    expect(git('commit', '-q', '--allow-empty', '-m', 'init').status).toBe(0);
    expect(git('checkout', '-q', '-b', 'feat/x').status).toBe(0);
    const { config } = detectConfig(dir, 'make ci') as { config: { base: string } };
    expect(config.base).toBe('main');
  });

  it('refuses a tools/squad/ that a project owns, and writes nothing into it', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'tools/squad/deploy.sh': 'echo mine\n' });
    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tools/squad/ already exists and is not a squad set up by flow-tower');
    expect(readFileSync(join(dir, 'tools', 'squad', 'deploy.sh'), 'utf8')).toBe('echo mine\n');
    expect(existsSync(join(dir, 'tools', 'squad', 'run.mjs'))).toBe(false);
  });

  it('reports a missing key after init, without printing a value', { timeout: 30_000 }, () => {
    const home = tempDir('squad-nokey-home-');
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    // No key in the environment and an empty user folder: init must say the key is missing, and how to set it.
    const env = cleanEnv({ FLOW_TOWER_HOME: home });
    delete env.OPENROUTER_API_KEY;
    const r = spawnSync(process.execPath, [CLI, 'squad', 'init', dir], { encoding: 'utf8', timeout: 20_000, env });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('key: missing: run "');
    expect(r.stdout).toContain('squad key"');
  });

  it('leaves task folders out of git status and keeps TEMPLATE.md trackable (#265)', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    expect(run('squad', 'init', dir).status).toBe(0);
    // A step file in a new task folder must not show as untracked, or steps.sh reports UNTRACKED LEFT.
    mkdirSync(join(dir, 'tools', 'squad', 'tasks', '1'), { recursive: true });
    writeFileSync(join(dir, 'tools', 'squad', 'tasks', '1', '01-step.md'), '# step\n');
    const status = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).stdout;
    expect(status).not.toContain('tools/squad/tasks/1/');
    const template = spawnSync('git', ['-C', dir, 'check-ignore', '-q', 'tools/squad/tasks/TEMPLATE.md'], { encoding: 'utf8' });
    expect(template.status).toBe(1);
  });

  it('does not print the key line when a key is in the environment', { timeout: 30_000 }, () => {
    const home = tempDir('squad-haskey-home-');
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    const env = cleanEnv({ FLOW_TOWER_HOME: home, OPENROUTER_API_KEY: 'sk-or-test-not-real' });
    const r = spawnSync(process.execPath, [CLI, 'squad', 'init', dir], { encoding: 'utf8', timeout: 20_000, env });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('key: found (environment)');
    expect(r.stdout).not.toContain('put the key');
  });

  it('tells the user to commit the squad before the first step (#265 review)', { timeout: 30_000 }, () => {
    // A worktree reads squad.json from its branch: the next steps must say to commit what init wrote.
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    const r = run('squad', 'init', dir);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('git add tools/squad .gitignore');
  });

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
    expect(layers).toEqual(['intake', 'orchestration', 'specialists', 'quality', 'tools', 'harness', 'memory', 'models']);

    // The support files the tower points at, with the nested towers and the agents.
    for (const rel of ['towers/coder.tower.yaml', 'towers/researcher.tower.yaml', 'prompts/triage.md', 'src/main.ts', '.claude/agents/coder.md']) {
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
    const coder = join(squad, 'dev-squad', 'towers', 'coder.tower.yaml');
    writeFileSync(main, 'version: 1\nname: Mine\n');
    writeFileSync(coder, '# my edit\n');
    rmSync(join(squad, 'dev-squad', 'prompts', 'triage.md'));

    const forced = run('squad', 'init', dir, '--force');
    expect(forced.status, forced.stderr).toBe(0);
    expect(readFileSync(main, 'utf8')).toBe('version: 1\nname: Mine\n');
    expect(readFileSync(coder, 'utf8')).toBe('# my edit\n');
    expect(existsSync(join(squad, 'dev-squad', 'prompts', 'triage.md'))).toBe(true);
  });

  it('installs only allowlisted files from the source and skips secrets, links and node_modules', () => {
    // A source folder with traps: a key, a symlink to a secret, node_modules, .git, and a stray folder.
    const source = tempDir('squad-tower-src-');
    const secret = join(source, 'secret.txt');
    writeFileSync(secret, 'OPENROUTER_API_KEY=sk-or-x\n');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'src', 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(source, 'src', 'node_modules', 'pkg', 'i.js'), '');
    mkdirSync(join(source, 'src', '.git'), { recursive: true });
    writeFileSync(join(source, 'src', '.git', 'HEAD'), 'ref\n');
    writeFileSync(join(source, 'src', '.env'), 'OPENROUTER_API_KEY=sk-or-y\n');
    writeFileSync(join(source, 'src', 'ok.ts'), 'export {};\n');
    symlinkSync(secret, join(source, 'src', 'linked.ts'));
    mkdirSync(join(source, 'stray'), { recursive: true });
    writeFileSync(join(source, 'stray', 'x.md'), '');
    writeFileSync(join(source, 'README.md'), '# r\n');

    const squad = tempDir('squad-tower-dst-');
    const out = installTower(source, squad, 'Demo "quoted"');
    expect(out.main).toBe(true);
    const bundle = join(squad, 'dev-squad');
    expect(existsSync(join(bundle, 'src', 'ok.ts'))).toBe(true);
    expect(existsSync(join(bundle, 'README.md'))).toBe(true);
    expect(existsSync(join(bundle, 'src', '.env'))).toBe(false);
    expect(existsSync(join(bundle, 'src', 'linked.ts'))).toBe(false);
    expect(existsSync(join(bundle, 'src', 'node_modules'))).toBe(false);
    expect(existsSync(join(bundle, 'src', '.git'))).toBe(false);
    expect(existsSync(join(bundle, 'stray'))).toBe(false);
    // The name goes through the YAML document, so quotes survive and the main tower parses back to them.
    expect(parse(readFileSync(join(squad, 'squad.tower.yaml'), 'utf8')).name).toBe('Demo "quoted"');
  });

  it('detects python3 when only python3 is on PATH (#265 review)', () => {
    // Stock Ubuntu and macOS have no `python`: the fake PATH holds only an executable python3.
    const bin = tempDir('squad-py3-bin-');
    writeFileSync(join(bin, 'python3'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const dir = gitProject({ 'pyproject.toml': '[project]\nname = "x"\n' });
    const savedPath = process.env.PATH;
    process.env.PATH = bin;
    try {
      const { config } = detectConfig(dir) as { config: { commands: Record<string, string> } };
      expect(config.commands.check).toBe('python3 -m pytest');
    } finally {
      process.env.PATH = savedPath;
    }
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
    mkdirSync(join(source, 'src'), { recursive: true });
    writeFileSync(join(source, 'src', 'ok.ts'), 'export {};\n');
    const squad = tempDir('squad-tower-dst2-');
    const outside = tempDir('squad-tower-outside-');
    symlinkSync(outside, join(squad, 'dev-squad'));
    expect(() => installTower(source, squad, 'Demo')).toThrow(/not a real folder/);
    expect(readdirSyncSafe(outside)).toEqual([]);
    expect(existsSync(join(squad, 'squad.tower.yaml'))).toBe(false);
  });

  it('refuses a nested folder inside the bundle that is a symlink', () => {
    const source = tempDir('squad-tower-src3-');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'src', 'lib'), { recursive: true });
    writeFileSync(join(source, 'src', 'lib', 'a.ts'), 'export {};\n');
    const squad = tempDir('squad-tower-dst3-');
    const outside = tempDir('squad-tower-outside3-');
    mkdirSync(join(squad, 'dev-squad', 'src'), { recursive: true });
    symlinkSync(outside, join(squad, 'dev-squad', 'src', 'lib'));
    expect(() => installTower(source, squad, 'Demo')).toThrow(/not a real folder/);
    expect(readdirSyncSafe(outside)).toEqual([]);
  });

  it('skips a secret-named folder without reading inside it', () => {
    const source = tempDir('squad-tower-src4-');
    writeFileSync(join(source, 'dev-squad.tower.yaml'), 'version: 1\nname: Dev Squad\nroot: ../..\nlayers: []\n');
    mkdirSync(join(source, 'src', '.ssh'), { recursive: true });
    writeFileSync(join(source, 'src', '.ssh', 'notes.txt'), 'not a key, but the folder is a secret\n');
    mkdirSync(join(source, 'src', 'keys.pem'), { recursive: true });
    writeFileSync(join(source, 'src', 'keys.pem', 'a.txt'), '');
    writeFileSync(join(source, 'src', 'ok.ts'), 'export {};\n');
    const squad = tempDir('squad-tower-dst4-');
    installTower(source, squad, 'Demo');
    const bundle = join(squad, 'dev-squad');
    expect(existsSync(join(bundle, 'src', '.ssh'))).toBe(false);
    expect(existsSync(join(bundle, 'src', 'keys.pem'))).toBe(false);
    expect(existsSync(join(bundle, 'src', 'ok.ts'))).toBe(true);
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

  it('lets the bundled example logs be tracked even when the repo ignores *.log', { timeout: 30_000 }, () => {
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '', '.gitignore': '*.log\n' });
    expect(run('squad', 'init', dir).status).toBe(0);
    const check = (path: string) => spawnSync('git', ['-C', dir, 'check-ignore', '-q', path], { encoding: 'utf8' }).status;
    // The installed bundled log is trackable; a runtime log under tools/squad/ stays ignored.
    expect(check('tools/squad/dev-squad/logs/hooks.log')).toBe(1);
    expect(check('tools/squad/run.log')).toBe(0);
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
