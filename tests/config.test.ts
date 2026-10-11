import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effective, loadConfig, stripJsonc } from '../src/server/config';

/** One config file for the hub and the emit settings (#90): JSONC, precedence and a safe migration. */

/** A checkout and a home folder, both empty: the loader reads only what a test puts there. */
function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'flow-tower-config-'));
  const home = join(root, 'home');
  const checkout = join(root, 'checkout');
  mkdirSync(home, { recursive: true });
  mkdirSync(checkout, { recursive: true });
  const write = (dir: string, name: string, content: string, mode = 0o600) => {
    const path = join(dir, name);
    writeFileSync(path, content, { mode });
    chmodSync(path, mode);
    return path;
  };
  return { home, checkout, write };
}

describe('loadConfig', () => {
  it('reads JSONC: comments and trailing commas are fine', () => {
    const { home, checkout, write } = dirs();
    write(checkout, 'flow-tower.local.json', `{
      // the checkout's own settings
      "hub": true,
      /* a blocking
         comment */
      "viewers": ["alice@example.com", "bob@example.com",],
      "url": "http://127.0.0.1:5317",
    }`);
    const { config, warnings, sources } = loadConfig({ home, checkout });
    expect(warnings).toEqual([]);
    expect(config).toEqual({ hub: true, viewers: ['alice@example.com', 'bob@example.com'], url: 'http://127.0.0.1:5317' });
    expect(sources).toEqual([join(checkout, 'flow-tower.local.json')]);

    // A comment marker inside a string is not a comment.
    expect(JSON.parse(stripJsonc('{ "url": "http://x//y", "p": "a,]" }'))).toEqual({ url: 'http://x//y', p: 'a,]' });
  });

  it('lets the user config win over the checkout file', () => {
    const { home, checkout, write } = dirs();
    write(checkout, 'flow-tower.local.json', '{ "url": "http://local", "user": "dev" }');
    write(home, 'config.json', '{ "url": "https://hub.example.com" }');
    const { config, sources, warnings } = loadConfig({ home, checkout });
    expect(config).toEqual({ url: 'https://hub.example.com', user: 'dev' });
    expect(sources).toEqual([join(checkout, 'flow-tower.local.json'), join(home, 'config.json')]);
    expect(warnings).toEqual([]);
  });

  it('turns an invalid file into a warning, never a crash', () => {
    const { home, checkout, write } = dirs();
    write(home, 'config.json', '{ "hub": "yes" }'); // wrong type: a warning, not a crash
    expect(loadConfig({ home, checkout }).warnings[0]).toMatch(/config\.json/);

    const unparsable = dirs();
    unparsable.write(unparsable.home, 'config.json', '{ nope');
    const { config, warnings } = loadConfig({ home: unparsable.home, checkout: unparsable.checkout });
    expect(warnings.some((w) => /invalid JSON/.test(w))).toBe(true);
    expect(config).toEqual({});
  });

  it('migrates viewers and profile from hub.json without touching the file', () => {
    const { home, checkout, write } = dirs();
    write(home, 'hub.json', '{ "viewers": ["carol@example.com"], "profile": "freelancers", "extra": true }');
    const { config, warnings } = loadConfig({ home, checkout });
    expect(config.viewers).toEqual(['carol@example.com']);
    expect(config.profile).toBe('freelancers');
    expect(warnings).toContain('hub.json is deprecated: move its keys into config.json');

    // A key config.json already sets wins: no override from the deprecated file.
    const own = dirs();
    own.write(own.home, 'hub.json', '{ "viewers": ["old@example.com"] }');
    own.write(own.home, 'config.json', '{ "viewers": ["new@example.com"] }');
    expect(loadConfig({ home: own.home, checkout: own.checkout }).config.viewers).toEqual(['new@example.com']);
  });

  it('warns when config.json is readable by group or others', () => {
    const { home, checkout, write } = dirs();
    write(home, 'config.json', '{ "token": "ft_x_secret" }', 0o644);
    expect(loadConfig({ home, checkout }).warnings.some((w) => /readable by group or others/.test(w))).toBe(true);

    const safe = dirs();
    safe.write(safe.home, 'config.json', '{ "token": "ft_x_secret" }', 0o600);
    expect(loadConfig({ home: safe.home, checkout: safe.checkout }).warnings).toEqual([]);
  });

  it('warns when the checkout local file is readable by group or others', () => {
    const { home, checkout, write } = dirs();
    const path = write(checkout, 'flow-tower.local.json', '{ "token": "ft_x_secret" }', 0o644);
    const warnings = loadConfig({ home, checkout }).warnings;
    expect(warnings.some((w) => w.startsWith(path) && /readable by group or others/.test(w))).toBe(true);
  });

  it('is ignored by git in the checkout', () => {
    // The rule lives at the repo root; this file may hold a sender token, so it must never be committed.
    const r = spawnSync('git', ['check-ignore', '-q', 'flow-tower.local.json'], { cwd: process.cwd() });
    expect(r.status).toBe(0);
  });
});

describe('effective', () => {
  it('resolves flags > environment > config > defaults', () => {
    const config = { hub: false, ingestOnly: false, allowedHosts: ['from-config'], retentionDays: 7, user: 'config-user', url: 'http://config' };
    const env = { FLOW_TOWER_HUB: '1', FLOW_TOWER_ALLOWED_HOSTS: 'a.example, b.example', FLOW_TOWER_RETENTION_DAYS: '3', FLOW_TOWER_USER: 'env-user' } as NodeJS.ProcessEnv;

    // Environment beats config.
    const fromEnv = effective(config, env);
    expect(fromEnv.hub).toBe(true);
    expect(fromEnv.allowedHosts).toEqual(['a.example', 'b.example']);
    expect(fromEnv.retentionDays).toBe(3);
    expect(fromEnv.user).toBe('env-user');
    expect(fromEnv.url).toBe('http://config');

    // Flags beat everything; defaults fill the rest.
    const fromFlags = effective(config, env, { hub: false, ingestOnly: true, user: 'flag-user', machine: 'box-1' });
    expect(fromFlags).toMatchObject({ hub: false, ingestOnly: true, user: 'flag-user', machine: 'box-1' });

    const defaults = effective({}, {});
    expect(defaults).toMatchObject({ hub: false, ingestOnly: false, allowedHosts: [], retentionDays: 14, role: 'local', viewers: [] });
  });

  it('treats an empty environment value as unset, so it never switches off the config', () => {
    const env = { FLOW_TOWER_USER: '', FLOW_TOWER_MACHINE: ' ', FLOW_TOWER_HUB: '', FLOW_TOWER_INGEST_ONLY: '', FLOW_TOWER_ALLOWED_HOSTS: '', FLOW_TOWER_TOKEN: '' } as NodeJS.ProcessEnv;
    const config = { user: 'config-user', machine: 'config-box', hub: true, ingestOnly: true, allowedHosts: ['hub.example'], token: 'ft_cfg' };
    expect(effective(config, env)).toMatchObject({ ...config });
  });

  it('reads `paused` from the config only, never from the environment', () => {
    // The sharing control is the only writer: no env var and no flag may pause (or unpause) a relay.
    expect(effective({}, {}).paused).toBe(false);
    expect(effective({ paused: true }, {}).paused).toBe(true);
    expect(effective({ paused: false }, { FLOW_TOWER_PAUSED: '1' } as NodeJS.ProcessEnv).paused).toBe(false);
  });

  it('clamps retention and keeps the UX keys as they are', () => {
    expect(effective({}, { FLOW_TOWER_RETENTION_DAYS: '99' } as NodeJS.ProcessEnv).retentionDays).toBe(21);
    const config = {
      cadence: { alice: 'scheduled' as const }, budgets: { global: 20, projects: { api: 5 } },
      alerts: { budget: true }, noticeRef: 'notice-1', purpose: 'team hub',
    };
    expect(effective(config, {})).toMatchObject(config);
  });
});
