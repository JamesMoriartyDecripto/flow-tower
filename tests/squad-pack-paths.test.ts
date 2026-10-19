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

// A tracked key under src/ must never reach the packed task, whether the folder comes from --paths or from squad.json.
// This block has its own repo so the key sits in the feature commit next to the change of src/a.ts.
describe('squad pack keeps secret-looking files out of the diff (#249)', () => {
  let keyRepo: string;
  const runIn = (args: string[]) => spawnSync(process.execPath, [script, ...args, '--repo', keyRepo, '--base', 'main', '--brief', join(keyRepo, 'brief.md')], { encoding: 'utf8', timeout: 20_000 });

  beforeEach(() => {
    keyRepo = mkdtempSync(join(tmpdir(), 'squad-pack-key-'));
    mkdirSync(join(keyRepo, 'src'));
    writeFileSync(join(keyRepo, 'src', 'a.ts'), 'export const a = 1;\n');
    git(keyRepo, 'init', '-q', '-b', 'main');
    git(keyRepo, 'add', '.');
    git(keyRepo, 'commit', '-q', '-m', 'base');
    git(keyRepo, 'checkout', '-q', '-b', 'feat');
    writeFileSync(join(keyRepo, 'src', 'a.ts'), 'export const a = 2;\nexport const b = 3;\n');
    writeFileSync(join(keyRepo, 'src', 'key.pem'), 'SECRET-VALUE\n');
    git(keyRepo, 'add', '.');
    git(keyRepo, 'commit', '-q', '-m', 'change with key');
    writeFileSync(join(keyRepo, 'brief.md'), 'Review the change.\n');
  });
  afterEach(() => { rmSync(keyRepo, { recursive: true, force: true }); });

  it('--paths src keeps the change, drops key.pem and says so on stderr', () => {
    const r = runIn(['--role', 'reviewer', '--issue', '249', '--paths', 'src']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('+export const b = 3;');
    expect(r.stdout).not.toContain('SECRET-VALUE');
    expect(r.stderr).toContain('left out of the diff: src/key.pem');
  });

  it('the default review folder (src) also leaves key.pem out', () => {
    const r = runIn(['--role', 'reviewer', '--issue', '249']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('SECRET-VALUE');
  });

  it('a glob in --paths is read literally, so it names no file and leaks nothing', () => {
    const r = runIn(['--role', 'reviewer', '--issue', '249', '--paths', 'src/*']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('SECRET-VALUE');
  });
});

// Git's name list is not enough: a rename shows only the new name, and a non-ASCII name is C-quoted. The keys here
// are a renamed key (the new name looks harmless) and a key with a non-ASCII name, so both must be dropped.
describe('squad pack drops renamed and non-ASCII key files (#249)', () => {
  let renameRepo: string;

  beforeEach(() => {
    renameRepo = mkdtempSync(join(tmpdir(), 'squad-pack-rename-'));
    mkdirSync(join(renameRepo, 'src'));
    writeFileSync(join(renameRepo, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(renameRepo, 'src', 'old.pem'), 'SECRET-VALUE\n');
    git(renameRepo, 'init', '-q', '-b', 'main');
    git(renameRepo, 'add', '.');
    git(renameRepo, 'commit', '-q', '-m', 'base');
    git(renameRepo, 'checkout', '-q', '-b', 'feat');
    writeFileSync(join(renameRepo, 'src', 'a.ts'), 'export const a = 2;\nexport const b = 3;\n');
    git(renameRepo, 'mv', 'src/old.pem', 'src/notes.txt');
    writeFileSync(join(renameRepo, 'src', 'kéy.pem'), 'OTHER-SECRET\n');
    git(renameRepo, 'add', '.');
    git(renameRepo, 'commit', '-q', '-m', 'rename key and add a non-ASCII key');
    writeFileSync(join(renameRepo, 'brief.md'), 'Review the change.\n');
  });
  afterEach(() => { rmSync(renameRepo, { recursive: true, force: true }); });

  it('keeps the change, drops the renamed key and the non-ASCII key, and names both on stderr', () => {
    const r = spawnSync(process.execPath, [script, '--role', 'reviewer', '--issue', '249', '--paths', 'src', '--repo', renameRepo, '--base', 'main', '--brief', join(renameRepo, 'brief.md')], { encoding: 'utf8', timeout: 20_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('+export const b = 3;');
    expect(r.stdout).not.toContain('SECRET-VALUE');
    expect(r.stdout).not.toContain('OTHER-SECRET');
    expect(r.stderr).toContain('left out of the diff: src/notes.txt');
    expect(r.stderr).toContain('left out of the diff: src/kéy.pem');
  });
});
