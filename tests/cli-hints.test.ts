import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { cliName, shellPath, OTHER_MACHINE_CLI } from '../bin/cli-name.js';
import { placeholderHosts } from '../src/server/config';
import { cleanEnv } from './fixtures/clean-env';

/**
 * CLI hints (#193): the command name a hint prints, the connect line `token add` prints, the placeholder
 * check and copy --list's dogfood mark. Each spawned CLI gets a temp FLOW_TOWER_HOME, so the user's config
 * is never read and no server starts (no port is opened here).
 */
const CHECKOUT = resolve('.');
const CLI = join(CHECKOUT, 'bin', 'flow-tower.js');
const home = mkdtempSync(join(tmpdir(), 'flow-tower-hints-'));
const fakeBin = mkdtempSync(join(tmpdir(), 'flow-tower-path-'));
const TOKEN_SHAPE = /ft_[a-z0-9-]+_[A-Za-z0-9_-]+/;

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(fakeBin, { recursive: true, force: true });
});

describe('cliName (#193)', () => {
  it('prints the bare name when a flow-tower symlink on PATH resolves to this checkout', () => {
    const dir = join(fakeBin, 'on-path');
    mkdirSync(dir, { recursive: true });
    // npm link makes a symlink; realpath on both sides means the link is followed, not compared by text.
    symlinkSync(CLI, join(dir, 'flow-tower'));
    expect(cliName({ env: { PATH: dir }, checkout: CHECKOUT })).toBe('flow-tower');
  });

  it('falls back to the node form when PATH is empty', () => {
    expect(cliName({ env: { PATH: '' }, checkout: CHECKOUT })).toBe(`node ${shellPath(CLI)}`);
  });

  it('falls back when the flow-tower on PATH is some other program', () => {
    const dir = join(fakeBin, 'other');
    mkdirSync(dir, { recursive: true });
    const other = join(fakeBin, 'other-program.js');
    writeFileSync(other, '#!/bin/sh\n');
    symlinkSync(other, join(dir, 'flow-tower'));
    expect(cliName({ env: { PATH: [dir].join(delimiter) }, checkout: CHECKOUT })).toBe(`node ${shellPath(CLI)}`);
  });

  it('quotes a checkout path that has a space', () => {
    expect(shellPath('/a b/bin/flow-tower.js')).toBe("'/a b/bin/flow-tower.js'");
    expect(shellPath('/ab/flow-tower.js')).toBe('/ab/flow-tower.js');
  });

  it('keeps the bare name for the other machine and adds the node form', () => {
    expect(OTHER_MACHINE_CLI).toBe('flow-tower (or node <their checkout>/bin/flow-tower.js)');
  });
});

describe('token add prints a connect line (#193)', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(CHECKOUT, 'src', 'cli', 'token.ts'), ...args], {
      encoding: 'utf8',
      env: cleanEnv({ FLOW_TOWER_HOME: home }),
    });

  it('prints the connect command with the token, and never a second token', () => {
    const r = run('add', 'laptop');
    expect(r.status).toBe(0);
    const tokens = r.stdout.match(new RegExp(TOKEN_SHAPE.source, 'g')) ?? [];
    // The token is printed twice by design (the bare line and the connect line); it must be the same one.
    expect(new Set(tokens).size).toBe(1);
    expect(r.stdout).toContain('connect');
    expect(r.stdout).toContain('--machine laptop');
    expect(r.stdout).toContain('on the other machine:');
    expect(r.stdout).toContain('replace 127.0.0.1');
  });

  it('uses the configured url when config.json names one', () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ url: 'https://hub.tail1234.ts.net' }), { mode: 0o600 });
    const r = run('add', 'desk');
    expect(r.stdout).toContain('connect https://hub.tail1234.ts.net --token');
    expect(r.stdout).not.toContain('replace 127.0.0.1');
    rmSync(join(home, 'config.json'), { force: true });
  });

  it('keeps a loopback url the config names on purpose, without the tailnet hint', () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ url: 'http://127.0.0.1:5317' }), { mode: 0o600 });
    const r = run('add', 'lab');
    expect(r.stdout).toContain('connect http://127.0.0.1:5317 --token');
    expect(r.stdout).not.toContain('replace 127.0.0.1');
    rmSync(join(home, 'config.json'), { force: true });
  });
});

describe('placeholderHosts (#193)', () => {
  it('finds the kit domains in allowedHosts and viewers', () => {
    expect(placeholderHosts({ allowedHosts: ['hub.example.ts.net', 'hub.tail1.ts.net'], viewers: ['alice@example.com'] }))
      .toEqual(['hub.example.ts.net', 'alice@example.com']);
  });

  it('does not flag a name that only ends in the kit domain as a suffix', () => {
    expect(placeholderHosts({ allowedHosts: ['notexample.com'] })).toEqual([]);
  });

  it('is empty for a config with no placeholders', () => {
    expect(placeholderHosts({})).toEqual([]);
  });
});

describe('copy --list marks dogfood towers (#193)', () => {
  const list = () =>
    spawnSync(process.execPath, [CLI, 'copy', '--list'], { encoding: 'utf8', timeout: 20_000, env: cleanEnv({ FLOW_TOWER_HOME: home }) });

  it('marks a root: ../.. example and sorts it after the rest', () => {
    const lines = list().stdout.trim().split('\n');
    const marked = lines.filter((l) => l.includes('(needs adapting: points at this repo)'));
    expect(marked.length).toBeGreaterThan(0);
    // Every marked line sits after every unmarked one.
    const firstMarked = lines.findIndex((l) => l.includes('(needs adapting'));
    expect(lines.slice(firstMarked).every((l) => l.includes('(needs adapting'))).toBe(true);
    expect(marked.some((l) => l.startsWith('docs-qa '))).toBe(true);
  });

  it('leaves an ordinary example unmarked', () => {
    const line = list().stdout.split('\n').find((l) => l.startsWith('dev-squad '));
    expect(line).toBeDefined();
    expect(line).not.toContain('needs adapting');
  });
});

describe('shellPath round-trips through the shell (#193)', () => {
  it('a checkout path with a space, a double quote, a dollar sign and a single quote pastes as one word', () => {
    const odd = "/srv/my dir/a\"b$HOME/it's";
    // Pasting the hint runs it through sh; the printed word must come back byte for byte, not expanded.
    const r = spawnSync('sh', ['-c', `printf %s ${shellPath(odd)}`], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(odd);
  });

  it('leaves a plain path unquoted', () => {
    expect(shellPath('/home/me/flow-tower/bin/flow-tower.js')).toBe('/home/me/flow-tower/bin/flow-tower.js');
  });
});
