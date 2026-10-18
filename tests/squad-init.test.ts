import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  it('sets a Node project up: runner, squad.json, tower, gitignore', () => {
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
    expect(ignore.filter((l) => l === 'tools/squad/tasks/*.out')).toHaveLength(1);
  });

  it('refuses a second init, and --force keeps an edited squad.json', () => {
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

  it('finds no check for a placeholder npm test script', () => {
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

  it('refuses a folder that is not a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-plain-'));
    const r = run('squad', 'init', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a git repository');
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
