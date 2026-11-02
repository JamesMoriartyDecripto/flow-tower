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

  it('runs from a private copy so edits to steps.sh cannot break a run (#353)', () => {
    const text = readFileSync(join(squad, 'steps.sh'), 'utf8');
    expect(text).toContain('SQUAD_STEPS_COPY');
    expect(text).toContain('SQUAD_STEPS_HOME');
    const r = spawnSync('bash', ['-n', join(squad, 'steps.sh')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('skips done steps and stages only the step scope (#353)', () => {
    const text = readFileSync(join(squad, 'steps.sh'), 'utf8');
    expect(text).toContain('step-scope.mjs" done');
    expect(text).toContain('step-scope.mjs" stage');
    expect(text).toContain('foreign-touched');
    expect(text).not.toContain('git add -u');
  });

  it('removes its output folder after ALL GREEN, and old leftovers first (#357)', () => {
    const text = readFileSync(join(squad, 'steps.sh'), 'utf8');
    expect(text).toContain('-mtime +7');
    expect(text).toContain('rm -rf -- "$OUT"');
    const costLine = text.indexOf('cost.mjs" "$issue"');
    expect(costLine).toBeGreaterThan(-1);
    expect(text.indexOf('rm -rf -- "$OUT"')).toBeGreaterThan(costLine);
  });

  it('keeps the task folder out of the probe sweep (#420)', () => {
    const text = readFileSync(join(squad, 'steps.sh'), 'utf8');
    expect(text).toContain('tasksRel');
    expect(text.indexOf('tasksRel=')).toBeLessThan(text.indexOf('removed coder probe file'));
  });

  it('makes REPO and the task folder absolute before the first cd "$R" (#394)', () => {
    const text = readFileSync(join(squad, 'steps.sh'), 'utf8');
    expect(text).toContain('R=$(cd "$R" && pwd)');
    expect(text).toContain('dir=$(cd "$dir" && pwd)');
    expect(text.indexOf('R=$(cd "$R" && pwd)')).toBeLessThan(text.indexOf('cd "$R" || exit 1'));
  });

  it('resolves a relative REPO and stops on a missing task folder before any coder call (#394)', () => {
    const repo = join(tmp, 'repo');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    const r = spawnSync('bash', [join(squad, 'steps.sh'), '1', 'no-such-folder', '', 't'], {
      encoding: 'utf8', cwd: tmp, env: { ...process.env, REPO: 'repo' }, timeout: 20_000,
    });
    expect(r.stdout).toContain('RED: task folder not found');
    expect(r.status).toBe(1);
  });

  it('uses no mapfile or GIT_LITERAL_PATHSPECS, and every mktemp template ends in XXXXXX (#396, #403)', () => {
    const text = readFileSync(join(squad, 'steps.sh'), 'utf8');
    expect(text).not.toContain('mapfile');
    expect(text).not.toContain('GIT_LITERAL_PATHSPECS');
    const templates = [...text.matchAll(/mktemp (?:-d )?"([^"]*)"/g)].map((m) => m[1]);
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) expect(t).toMatch(/XXXXXX$/);
  });

  it('commits a name with brackets while a pre-commit hook still sees normal pathspecs (#403)', { timeout: 20000 }, () => {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'a'), { recursive: true });
    writeFileSync(join(repo, 'a', 'b.txt'), 'b\n');
    writeFileSync(join(repo, 'a', 'c[1].txt'), 'c\n');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    // The hook records what git ls-files matches for a glob: it must see both files.
    const seen = join(tmp, 'seen.txt');
    writeFileSync(join(repo, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\ngit ls-files -- 'a/*.txt' > ${JSON.stringify(seen)}\n`, { mode: 0o755 });
    writeFileSync(join(repo, 'a', 'c[1].txt'), 'c2\n');
    const opts = { cwd: repo, encoding: 'utf8' as const, timeout: 20000 };
    const ident = ['-c', 'user.email=t@t', '-c', 'user.name=t'];
    execFileSync('git', ['add', '--', ':(literal)a/c[1].txt'], opts);
    execFileSync('git', [...ident, 'commit', '-q', '-m', 't', '--', ':(literal)a/c[1].txt'], opts);
    const lines = readFileSync(seen, 'utf8').trim().split('\n');
    expect(lines).toContain('a/b.txt');
    expect(lines).toContain('a/c[1].txt');
  });
});
