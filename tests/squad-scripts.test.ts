import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const squad = fileURLToPath(new URL('../tools/squad/', import.meta.url));
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' });

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'squad-scripts-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

// ev.sh picks its CLI from the environment (#265). The system dirs only: no flow-tower on PATH, no repo bin folder.
const SYS_PATH = '/usr/bin:/bin';

describe('ev.sh (#265)', () => {
  it('runs the CLI named by FLOW_TOWER_CLI with node, with the tower name and the node', () => {
    const log = join(tmp, 'argv.txt');
    const fake = join(tmp, 'fake.js');
    writeFileSync(fake, `require('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(' ') + '\\n');\n`);
    const r = spawnSync('sh', [join(squad, 'ev.sh'), 'log', 'coder.step', 'hello'], {
      encoding: 'utf8',
      // On CI node sits in the tool cache, not in SYS_PATH; put the running node's folder first so ev.sh's `node` resolves.
      env: { PATH: `${dirname(process.execPath)}:${SYS_PATH}`, FLOW_TOWER_CLI: fake, SQUAD_TOWER: 'Test Tower' },
    });
    expect(r.status).toBe(0);
    const argv = readFileSync(log, 'utf8');
    expect(argv).toContain('emit');
    expect(argv).toContain('--tower Test Tower');
    expect(argv).toContain('--node coder.step');
  });

  it('exits 0 and writes nothing when no CLI is found', () => {
    // A copy in a folder with no ../../bin: nothing to light, so the script is silent and successful.
    const dir = join(tmp, 'a', 'b', 'c');
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(squad, 'ev.sh'), join(dir, 'ev.sh'));
    const r = spawnSync('sh', [join(dir, 'ev.sh'), 'log', 'coder.step', 'hello'], {
      encoding: 'utf8',
      env: { PATH: SYS_PATH },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
  });
});

describe('pack.mjs reads the review folders from squad.json (#265)', () => {
  it('diffs only config.review against config.base', () => {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'lib'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'lib', 'a.js'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'src', 'b.js'), 'export const b = 1;\n');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ review: ['lib'], base: 'HEAD' }));
    writeFileSync(join(repo, 'lib', 'a.js'), 'export const a = 2;\n');
    writeFileSync(join(repo, 'src', 'b.js'), 'export const b = 2;\n');
    const brief = join(tmp, 'brief.md');
    writeFileSync(brief, 'Change a.\n');

    const r = spawnSync(process.execPath, [join(squad, 'pack.mjs'), '--role', 'reviewer', '--issue', '265', '--repo', repo, '--brief', brief], {
      encoding: 'utf8', timeout: 20_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('lib/a.js');
    expect(r.stdout).toContain('+export const a = 2;');
    expect(r.stdout).not.toContain('src/b.js');
    expect(r.stdout).toContain('git diff HEAD -- lib');
  });
});

describe('squad keeps the key from project commands (#265 review)', () => {
  it('config.mjs check runs the project command without OPENROUTER_API_KEY', () => {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ commands: { check: 'node -e process.exit(process.env.OPENROUTER_API_KEY?7:0)' } }));
    const r = spawnSync(process.execPath, [join(squad, 'config.mjs'), 'check', repo], {
      encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: 'x' },
    });
    expect(r.status).toBe(0);
  });
});

describe('pack.mjs refuses a link that leaves the repo (#265 review)', () => {
  it('refuses lib/link.txt pointing outside the repo, and names the path', () => {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'lib'), { recursive: true });
    writeFileSync(join(tmp, 'outside.txt'), 'outside the repo\n');
    symlinkSync(join(tmp, 'outside.txt'), join(repo, 'lib', 'link.txt'));
    writeFileSync(join(repo, 'lib', 'a.js'), 'export const a = 1;\n');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ base: 'HEAD' }));
    const brief = join(tmp, 'brief.md');
    writeFileSync(brief, 'Review.\n');

    const r = spawnSync(process.execPath, [join(squad, 'pack.mjs'), '--role', 'reviewer', '--issue', '265', '--repo', repo, '--brief', brief, '--files', 'lib/link.txt'], {
      encoding: 'utf8', timeout: 20_000,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('lib/link.txt');
    expect(r.stdout).not.toContain('outside the repo');
  });
});

describe('steps.sh (#265)', () => {
  it('passes bash -n', () => {
    const r = spawnSync('bash', ['-n', join(squad, 'steps.sh')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
