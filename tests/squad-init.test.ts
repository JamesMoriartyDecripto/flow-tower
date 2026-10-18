import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectConfig } from '../src/cli/squad';
import { cleanEnv } from './fixtures/clean-env';

const CLI = resolve('bin/flow-tower.js');
// A hung CLI would otherwise block this process forever: the timeout lets the test fail instead of the run.
const run = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20_000, env: cleanEnv() });

/** A fresh git repository in a temp folder, so every test starts from an empty project. */
function gitProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-init-'));
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
    expect(config.commands.check).toBe('python -m pytest');
    expect(config.commands.test).toBe('python -m pytest {file}');
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
    const dir = mkdtempSync(join(tmpdir(), 'squad-plain-'));
    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a git repository');
  });

  it('uses the current branch as base when there is no origin', () => {
    // git init -b names the only branch: with no origin, base must follow it, not assume main.
    const dir = mkdtempSync(join(tmpdir(), 'squad-base-'));
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
    const fakeHome = mkdtempSync(join(tmpdir(), 'squad-skill-home-'));
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
    const dir = mkdtempSync(join(tmpdir(), 'squad-main-'));
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
    const home = mkdtempSync(join(tmpdir(), 'squad-nokey-home-'));
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
    const home = mkdtempSync(join(tmpdir(), 'squad-haskey-home-'));
    const dir = gitProject({ 'package.json': JSON.stringify(nodePackage), 'src/a.ts': '' });
    const env = cleanEnv({ FLOW_TOWER_HOME: home, OPENROUTER_API_KEY: 'sk-or-test-not-real' });
    const r = spawnSync(process.execPath, [CLI, 'squad', 'init', dir], { encoding: 'utf8', timeout: 20_000, env });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('key: found (environment)');
    expect(r.stdout).not.toContain('put the key');
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
