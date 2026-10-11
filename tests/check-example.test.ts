import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CLI = resolve('bin/flow-tower.js');
const out = mkdtempSync(join(tmpdir(), 'flow-tower-check-example-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

// A hung CLI would otherwise block this process forever: the timeout lets the test fail instead of the run.
const check = (dir: string, ...args: string[]) =>
  spawnSync(process.execPath, [CLI, 'check-example', dir, ...args], { encoding: 'utf8', timeout: 20_000 });

/** A valid, self-contained tower whose prompt is a file, so the folder exercises the path checks. */
const TOWER = `version: 1
name: Demo
prompts:
  main: { file: prompts/main.md }
agents:
  main: { model: claude-sonnet-5-5, prompt: main }
layers:
  - id: flow
    title: Flow
    nodes:
      - { id: input, type: entry, label: Input }
      - { id: agent, agent: main, label: Agent }
    edges:
      - input -> agent
`;

const README = '# Demo\n\nA minimal example.\n\n## Sources\n\n- https://example.com/docs\n';

/** Writes a folder under the temp root; `files` are extra files by relative path. */
function make(name: string, files: Record<string, string> = {}): string {
  const dir = join(out, name);
  mkdirSync(join(dir, 'prompts'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), README);
  writeFileSync(join(dir, 'demo.tower.yaml'), TOWER);
  writeFileSync(join(dir, 'prompts/main.md'), 'You are a helpful agent.\n');
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

/** The rules a JSON run reported. */
const rules = (dir: string): { ok: boolean; rules: string[]; findings: { text: string }[] } => {
  const r = check(dir, '--json');
  const out = JSON.parse(r.stdout) as { ok: boolean; findings: { rule: string; text: string }[] };
  return { ok: out.ok, rules: out.findings.map((f) => f.rule), findings: out.findings };
};

describe('cli check-example (#116)', () => {
  it('passes a clean minimal example with exit 0', () => {
    const r = check(make('clean'));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('all checks passed');
    expect(rules(join(out, 'clean')).ok).toBe(true);
  });

  it.each([
    ['home path', '/Users/ada/notes.md', 'home-path'],
    ['email', 'write to ada@corp.example.io please', 'email'],
    ['public ipv4', 'host 8.8.8.8 is up', 'ipv4'],
    ['token', 'token ft_abcdefghijklmnopqrstuv here', 'secret'],
  ])('fires on a planted %s', (name, line, rule) => {
    const dir = make(`planted-${rule}-${name.replace(/\s/g, '-')}`);
    writeFileSync(join(dir, 'prompts/main.md'), `${line}\n`);
    const r = rules(dir);
    expect(r.ok).toBe(false);
    expect(r.rules).toContain(rule);
    expect(check(dir).status).toBe(1);
  });

  it('fires on a README without a Sources heading', () => {
    const dir = make('no-sources');
    writeFileSync(join(dir, 'README.md'), '# Demo\n\nNo heading here.\n');
    expect(rules(dir).rules).toContain('readme-sources');
  });

  it('fires on a missing README', () => {
    const dir = make('no-readme');
    rmSync(join(dir, 'README.md'));
    expect(rules(dir).rules).toContain('readme-missing');
  });

  it('fires on a root: ../.. tower that leaves the folder', () => {
    const dir = make('outside-root');
    writeFileSync(join(dir, 'demo.tower.yaml'), TOWER.replace('name: Demo', 'name: Demo\nroot: ../..'));
    const r = rules(dir);
    expect(r.ok).toBe(false);
    expect(r.rules).toContain('outside-root');
  });

  it('fires when a tower references a file outside the folder', () => {
    const dir = make('outside-file');
    writeFileSync(join(dir, 'demo.tower.yaml'), TOWER.replace('file: prompts/main.md', 'file: ../shared.md'));
    expect(rules(dir).rules).toContain('outside-file');
  });

  it('accepts example.com and 127.0.0.1 as placeholders', () => {
    const dir = make('placeholders');
    writeFileSync(join(dir, 'prompts/main.md'), 'Mail support@example.org\nLocal hub: http://127.0.0.1:5317\nDocs: 192.0.2.10\n');
    const r = rules(dir);
    expect(r.ok).toBe(true);
  });

  it('masks a secret-looking text in the JSON output', () => {
    const dir = make('masked');
    const token = 'ft_abcdefghijklmnopqrstuv';
    writeFileSync(join(dir, 'prompts/main.md'), `token ${token}\n`);
    const json = check(dir, '--json').stdout;
    expect(json).not.toContain(token);
    expect(json).toContain('ft_a');
  });

  it('does not fire on the ft_REPLACE_ME placeholder', () => {
    const dir = make('replace-me');
    writeFileSync(join(dir, 'prompts/main.md'), 'Set FLOW_TOWER_TOKEN=ft_REPLACE_ME in your shell.\n');
    expect(rules(dir).ok).toBe(true);
  });

  it('fires on a file over 1 MB', () => {
    const dir = make('big');
    writeFileSync(join(dir, 'notes.md'), 'a'.repeat(1_100_000));
    expect(rules(dir).rules).toContain('large-file');
  });

  it('fires on a git-ignored file', () => {
    const dir = make('ignored');
    writeFileSync(join(dir, '.gitignore'), 'scratch.txt\n');
    writeFileSync(join(dir, 'scratch.txt'), 'local notes\n');
    // check-ignore only answers inside a repository: make the temp folder one.
    spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 20_000 });
    expect(rules(dir).rules).toContain('git-ignored');
  });

  it('fails with exit 1 when the folder has no tower', () => {
    const dir = join(out, 'empty');
    mkdirSync(dir, { recursive: true });
    expect(check(dir).status).toBe(1);
    expect(existsSync(join(dir, 'README.md'))).toBe(false);
  });

  it('refuses a missing folder with exit 2', () => {
    const r = check(join(out, 'nope'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('not a folder');
  });
});
