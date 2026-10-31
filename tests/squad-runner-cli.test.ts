import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULTS, loadConfig } from '../tools/squad/config.mjs';
// @ts-expect-error plain .mjs without declarations
import { acquireLock, parseArgs } from '../tools/squad/runner.mjs';

// config.d.mts does not describe the runner limits, so the test reads them through this type.
type Runner = { usdPerIssue: number; minutes: number; fixRounds: number; pollMinutes: number };
const runnerOf = (cfg: unknown) => (cfg as { runner: Runner }).runner;

describe('runner.mjs argument parsing', () => {
  it('reads --once, --issue and --repo', () => {
    expect(parseArgs(['--once', '--issue', '5', '--repo', 'x'])).toEqual({
      once: true, issue: 5, repo: 'x', dryRun: false,
    });
  });

  it('refuses a non-numeric issue', () => {
    expect(() => parseArgs(['--issue', 'abc'])).toThrow(/positive issue number/);
  });

  it('refuses an unknown flag', () => {
    expect(() => parseArgs(['--loop'])).toThrow(/unknown argument/);
  });
});

describe('runner.mjs lock', () => {
  let dir: string;
  let lock: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'squad-lock-'));
    lock = join(dir, 'squad-runner', 'lock');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('takes a free lock and writes our pid', () => {
    expect(acquireLock(lock, 4242, () => true)).toEqual({ ok: true });
    expect(readFileSync(lock, 'utf8')).toBe('4242');
  });

  it('refuses a lock held by a live pid', () => {
    acquireLock(lock, 111, () => true);
    expect(acquireLock(lock, 222, () => true)).toEqual({ ok: false, pid: 111 });
    expect(readFileSync(lock, 'utf8')).toBe('111');
  });

  it('replaces a stale lock whose pid is dead', () => {
    acquireLock(lock, 111, () => true);
    expect(acquireLock(lock, 222, () => false)).toEqual({ ok: true });
    expect(readFileSync(lock, 'utf8')).toBe('222');
  });
});

describe('runner limits in squad.json', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'squad-cfg-'));
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('defaults include the runner limits', () => {
    expect(runnerOf(DEFAULTS)).toEqual({ usdPerIssue: 3, minutes: 90, fixRounds: 2, pollMinutes: 10 });
    expect(runnerOf(loadConfig(repo))).toEqual(runnerOf(DEFAULTS));
  });

  it('a negative usdPerIssue fails with the key named', () => {
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ runner: { usdPerIssue: -1 } }));
    expect(() => loadConfig(repo)).toThrow(/runner\.usdPerIssue/);
  });

  it('fixRounds may be 0', () => {
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ runner: { fixRounds: 0 } }));
    expect(runnerOf(loadConfig(repo)).fixRounds).toBe(0);
  });
});
