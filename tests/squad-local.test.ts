import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configProblem, credentialSource, doctor, gitRoot, nodeAtLeastMin, unsupportedRun, type Exec, type Probe } from '../src/cli/squad-local';

// Every temp folder is recorded and removed after the suite: no test leaves a folder behind.
const made: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const ok = (stdout = ''): Probe => ({ status: 0, stdout, stderr: '' });
const fail = (status = 1): Probe => ({ status, stdout: '', stderr: 'boom' });

/** A project folder with the runner files init copies and a valid squad.json. Nothing is executed in it. */
function installedProject(config: string = JSON.stringify({ commands: { check: 'npm run check' } })): string {
  const root = tempDir('squad-local-');
  const squad = join(root, 'tools', 'squad');
  mkdirSync(squad, { recursive: true });
  for (const f of ['steps.sh', 'run.mjs', 'pack.mjs', 'config.mjs', 'gate.mjs']) writeFileSync(join(squad, f), '');
  writeFileSync(join(squad, 'squad.json'), config);
  return root;
}

/**
 * A fake exec. Every call is recorded, so a test can check exactly which binaries were started and with which
 * arguments. Only the fixed git probes are answered; anything else is recorded and fails, so a stray call shows.
 */
function fakeExec(root: string, gitVersion: Probe = ok('git version 2.45.0\n')) {
  const calls: { cmd: string; args: string[] }[] = [];
  const exec: Exec = (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd !== 'git') return fail(127);
    if (args.includes('rev-parse')) return ok(`${root}\n`);
    if (args[0] === '--version') return gitVersion;
    return fail();
  };
  return { exec, calls };
}

/** Options for a healthy project: a key in the environment, a Node that is new enough, git present. */
const healthyOpts = (root: string) => ({
  exec: fakeExec(root).exec,
  env: { OPENROUTER_API_KEY: 'sk-or-test-not-real' },
  keyFile: join(tempDir('squad-local-key-'), '.env'),
  nodeVersion: 'v22.12.0',
});

describe('squad doctor, portable (#334)', () => {
  it('passes every check on a healthy project with an OpenRouter key and no SDK or Claude credential', () => {
    const root = installedProject();
    const { exec, calls } = fakeExec(root);
    const checks = doctor(root, { ...healthyOpts(root), exec, env: { OPENROUTER_API_KEY: 'sk-or-test-not-real' } });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    // Only fixed git probes run: no claude, no tsx, no gh, no npm, and nothing from the repo is started.
    expect(new Set(calls.map((c) => c.cmd))).toEqual(new Set(['git']));
  });

  it('fails when the OpenRouter key is missing, and says how to set it', () => {
    const root = installedProject();
    const checks = doctor(root, { ...healthyOpts(root), env: {}, keyFile: join(root, 'no-key') });
    const key = checks.find((c) => c.name === 'OpenRouter key');
    expect(key?.ok).toBe(false);
    expect(key?.detail).toContain('flow-tower squad key');
    expect(key?.detail).toContain('OPENROUTER_API_KEY');
  });

  it('accepts a key from the user key file and reports only its path, never the value', () => {
    const root = installedProject();
    const keyFile = join(tempDir('squad-local-keyfile-'), '.env');
    writeFileSync(keyFile, 'OPENROUTER_API_KEY=sk-or-secret-value\n');
    const checks = doctor(root, { ...healthyOpts(root), env: {}, keyFile });
    const key = checks.find((c) => c.name === 'OpenRouter key');
    expect(key?.ok).toBe(true);
    expect(key?.detail).toContain(keyFile);
    expect(JSON.stringify(checks)).not.toContain('sk-or-secret-value');
  });

  it('does not count a Claude credential as the OpenRouter key', () => {
    const root = installedProject();
    const keyFile = join(root, 'no-key');
    expect(credentialSource({ ANTHROPIC_API_KEY: 'sk-ant', CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, keyFile)).toBeUndefined();
    const checks = doctor(root, { ...healthyOpts(root), env: { ANTHROPIC_API_KEY: 'sk-ant', CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, keyFile });
    expect(checks.find((c) => c.name === 'OpenRouter key')?.ok).toBe(false);
  });

  it('fails the Node check on a Node older than 22.12', () => {
    const root = installedProject();
    const checks = doctor(root, { ...healthyOpts(root), nodeVersion: 'v20.19.0' });
    const node = checks.find((c) => c.name === 'node version');
    expect(node?.ok).toBe(false);
    expect(node?.detail).toContain('22.12.0');
  });

  it('fails the runner check and names the files that are missing', () => {
    const root = installedProject();
    rmSync(join(root, 'tools', 'squad', 'gate.mjs'));
    const checks = doctor(root, healthyOpts(root));
    const runner = checks.find((c) => c.name === 'runner files');
    expect(runner?.ok).toBe(false);
    expect(runner?.detail).toContain('gate.mjs');
  });

  it('fails the config check when squad init was never run', () => {
    const root = tempDir('squad-local-bare-');
    const checks = doctor(root, { ...healthyOpts(root), exec: fakeExec(root).exec });
    const config = checks.find((c) => c.name === 'squad config');
    expect(config?.ok).toBe(false);
    expect(config?.detail).toContain('squad init');
  });

  it('stops at the git check when the folder is not a repository, and starts no other program', () => {
    const { exec, calls } = fakeExec('/none');
    const failing: Exec = (cmd, args) => (cmd === 'git' && args.includes('rev-parse') ? fail(128) : exec(cmd, args));
    const checks = doctor('/not/a/repo', { exec: failing, env: {}, keyFile: '/none' });
    expect(checks).toHaveLength(1);
    expect(checks[0].ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(gitRoot('/not/a/repo', failing)).toBeUndefined();
  });

  it('warns that the squad runs the repo\'s checks, and that the current session is the lead', () => {
    const root = installedProject();
    const trust = doctor(root, healthyOpts(root)).find((c) => c.name === 'trust');
    expect(trust?.detail).toContain('trust');
    expect(trust?.detail).toContain('current session is the lead');
  });

  it('does not require gh, a GitHub remote or a clean working tree', () => {
    const root = installedProject();
    const checks = doctor(root, healthyOpts(root));
    const names = checks.map((c) => c.name);
    expect(names.some((n) => /gh|GitHub|clean|tsx|SDK/i.test(n))).toBe(false);
  });
});

describe('squad doctor helpers (#334)', () => {
  it('compares Node versions against 22.12.0 without accepting unparseable text', () => {
    expect(nodeAtLeastMin('v22.12.0')).toBe(true);
    expect(nodeAtLeastMin('22.13.1')).toBe(true);
    expect(nodeAtLeastMin('v24.0.0')).toBe(true);
    expect(nodeAtLeastMin('v22.11.9')).toBe(false);
    expect(nodeAtLeastMin('v20.19.0')).toBe(false);
    expect(nodeAtLeastMin('not-a-version')).toBe(false);
  });

  it('reads a malformed squad.json as a problem, without echoing its content', () => {
    expect(configProblem('{ "commands": { "check": "SENTINEL-SECRET-123" ')).toBe('not valid JSON');
    expect(configProblem('[]')).toBe('the config must be a JSON object');
    expect(configProblem('{"commands":{"check":"  "}}')).toBe('commands.check must be a non-empty string');
    expect(configProblem('{"commands":"npm test"}')).toBe('commands must be an object');
    expect(configProblem('{"commands":{"check":"npm test"},"models":{"coder":3}}')).toBe('models.coder must be a string');
    expect(configProblem('{"commands":{"check":"npm test"},"models":{"coder":"x/y"}}')).toBeUndefined();
  });

  it('reports a malformed squad.json as a failing check whose message never shows the content', () => {
    const root = installedProject('{ "commands": { "check": "SENTINEL-SECRET-123" ');
    const config = doctor(root, healthyOpts(root)).find((c) => c.name === 'squad config');
    expect(config?.ok).toBe(false);
    expect(config?.detail).toContain('not valid JSON');
    expect(JSON.stringify(config)).not.toContain('SENTINEL-SECRET-123');
  });

  it('reports a squad.json that is a directory as not a regular file, without a stack', () => {
    const root = installedProject();
    rmSync(join(root, 'tools', 'squad', 'squad.json'));
    mkdirSync(join(root, 'tools', 'squad', 'squad.json'));
    const config = doctor(root, healthyOpts(root)).find((c) => c.name === 'squad config');
    expect(config?.ok).toBe(false);
    expect(config?.detail).toContain('not a regular file');
    expect(config?.detail).not.toContain('at ');
  });

  it('runs the runner loader, so a malformed write, review, base or empty model is a failing check', () => {
    const cases: [object, string][] = [
      [{ write: [] }, '"write" must not be empty'],
      [{ review: '../x' }, '"review" must be an array'],
      [{ review: ['/etc'] }, '"review" has a bad dir'],
      [{ base: '--output=x' }, '"base" must be a revision'],
      [{ models: { coder: '  ' } }, '"models.coder" must not be empty'],
    ];
    for (const [cfg, reason] of cases) {
      const root = installedProject(JSON.stringify(cfg));
      const config = doctor(root, healthyOpts(root)).find((c) => c.name === 'squad config');
      expect(config?.ok, JSON.stringify(cfg)).toBe(false);
      expect(config?.detail, JSON.stringify(cfg)).toContain(reason);
    }
  });

  it('does not expose the config value in a loader failure', () => {
    const root = installedProject(JSON.stringify({ review: ['SENTINEL-SECRET-789/../x'] }));
    const config = doctor(root, healthyOpts(root)).find((c) => c.name === 'squad config');
    expect(config?.ok).toBe(false);
    expect(JSON.stringify(config)).not.toContain('SENTINEL-SECRET-789');
  });

  it('treats a key file that is a directory as an absent key, without throwing', () => {
    const root = installedProject();
    const keyDir = join(tempDir('squad-local-keydir-'), '.env');
    mkdirSync(keyDir);
    const checks = doctor(root, { ...healthyOpts(root), env: {}, keyFile: keyDir });
    expect(checks.find((c) => c.name === 'OpenRouter key')?.ok).toBe(false);
  });

  it('names the key source by its place, never by value', () => {
    const keyFile = join(tempDir('squad-local-key-'), '.env');
    writeFileSync(keyFile, 'OPENROUTER_API_KEY=sk-or-secret-value\n');
    expect(credentialSource({ OPENROUTER_API_KEY: 'sk-or-x' }, keyFile)).toBe('environment (OPENROUTER_API_KEY)');
    expect(credentialSource({}, keyFile)).toBe(keyFile);
    expect(credentialSource({}, join(tempDir('squad-local-none-'), '.env'))).toBeUndefined();
  });
});

describe('squad run is not a launch (#334)', () => {
  it('prints the harness instruction and exits nonzero without starting anything', () => {
    const errors: string[] = [];
    const spy = (msg: unknown) => { errors.push(String(msg)); };
    const original = console.error;
    console.error = spy;
    try {
      expect(unsupportedRun()).not.toBe(0);
    } finally {
      console.error = original;
    }
    const text = errors.join('\n');
    expect(text).toContain('Use your current harness with the flow-tower-squad skill');
    expect(text).toContain('nothing was started');
  });
});
