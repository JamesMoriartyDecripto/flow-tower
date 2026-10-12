import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../tools/squad/pack.mjs', import.meta.url));
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' });

let repo: string;
let briefFile: string;

// A base commit on main, then a change on top: the diff is what pack.mjs must carry.
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'squad-pack-'));
  briefFile = join(repo, 'brief.md');
  git(repo, 'init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'checkout', '-q', '-b', 'feat');
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 2;\nexport const b = 3;\n');
  git(repo, 'commit', '-qam', 'change');
  writeFileSync(briefFile, 'Make a bigger.\n');
});
afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

const run = (args: string[]) => spawnSync(process.execPath, [script, ...args, '--repo', repo, '--base', 'main', '--brief', briefFile], { encoding: 'utf8', timeout: 20_000 });

describe('squad pack (#169)', () => {
  it('carries the diff, the brief and the files with line numbers for a reviewer', () => {
    const r = run(['--role', 'reviewer', '--issue', '169', '--files', 'src/a.ts']);
    expect(r.status).toBe(0);
    const out = r.stdout;
    expect(out).toContain('# 169 reviewer review');
    expect(out).toContain('read-only review');
    expect(out).toContain('Focus: correctness bugs');
    expect(out).not.toContain('severity');
    expect(out).toContain('Make a bigger.');
    expect(out).toContain('+export const b = 3;');
    expect(out).toContain('Tests are not included');
    expect(out).toContain('### src/a.ts');
    expect(out).toMatch(/\s1\texport const a = 2;/);
    expect(out).toMatch(/\s2\texport const b = 3;/);
    expect(r.stderr).toBe('');
  });

  it('asks for severities for a security review', () => {
    const r = run(['--role', 'security', '--issue', '169']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Focus: who can mint or use a credential');
    expect(r.stdout).toContain('"severity":"critical|high|medium|low"');
  });

  it('cuts the diff with a marker and warns when over --max-kb', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';
    writeFileSync(join(repo, 'src', 'a.ts'), big);
    git(repo, 'commit', '-qam', 'big');
    const r = run(['--role', 'reviewer', '--issue', '169', '--max-kb', '1', '--files', 'src/a.ts']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\[… cut \d+ KB\]/);
    expect(r.stdout).not.toContain('### src/a.ts');
    expect(r.stderr).toContain('trimmed to fit');
  });

  it('refuses secret-looking paths and paths outside the repo', () => {
    writeFileSync(join(repo, '.env'), 'TOKEN=x\n');
    const env = run(['--role', 'reviewer', '--issue', '169', '--files', '.env']);
    expect(env.status).not.toBe(0);
    expect(env.stderr).toContain('path not allowed');
    expect(env.stdout).not.toContain('TOKEN=x');
    const outside = run(['--role', 'reviewer', '--issue', '169', '--files', '../x']);
    expect(outside.status).not.toBe(0);
  });
});
