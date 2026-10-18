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

// A base commit on main, then a change under src/ and examples/ on top: --paths decides which one is diffed.
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'squad-pack-paths-'));
  briefFile = join(repo, 'brief.md');
  git(repo, 'init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'src'));
  mkdirSync(join(repo, 'examples'));
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'examples', 'x.yaml'), 'name: x\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'checkout', '-q', '-b', 'feat');
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 2;\nexport const b = 3;\n');
  writeFileSync(join(repo, 'examples', 'x.yaml'), 'name: y\n');
  git(repo, 'commit', '-qam', 'change');
  writeFileSync(briefFile, 'Review the change.\n');
});
afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

const run = (args: string[]) => spawnSync(process.execPath, [script, ...args, '--repo', repo, '--base', 'main', '--brief', briefFile], { encoding: 'utf8', timeout: 20_000 });

describe('squad pack --paths (#249)', () => {
  it('without --paths the default review folder applies, so examples/ is left out', () => {
    const r = run(['--role', 'reviewer', '--issue', '249']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('+export const b = 3;');
    expect(r.stdout).not.toContain('examples/x.yaml');
  });

  it('--paths examples diffs only examples and names it in the heading', () => {
    const r = run(['--role', 'reviewer', '--issue', '249', '--paths', 'examples']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('-name: x');
    expect(r.stdout).toContain('+name: y');
    expect(r.stdout).not.toContain('+export const b = 3;');
    expect(r.stdout).toContain('git diff main -- examples');
  });

  it('--paths src,examples puts both changes in', () => {
    const r = run(['--role', 'reviewer', '--issue', '249', '--paths', 'src,examples']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('+export const b = 3;');
    expect(r.stdout).toContain('+name: y');
  });

  it('refuses paths outside the repo and paths that start with a dash', () => {
    const outside = run(['--role', 'reviewer', '--issue', '249', '--paths', '../outside']);
    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain('path not allowed');
    const dash = run(['--role', 'reviewer', '--issue', '249', '--paths', '-p']);
    expect(dash.status).toBe(1);
    expect(dash.stderr).toContain('path not allowed');
  });
});
