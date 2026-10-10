import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, hostname, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { IDENTITY_MAX, identityDefaults } from '../bin/identity.js';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { openHistory } from '../src/server/history/db';
import { COLUMNS, createHistory, RETENTION } from '../src/server/history/store';

const CLI = resolve('bin/flow-tower.js');
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

describe('cli emit identity (#82)', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterAll(() => servers.forEach((s) => s.close()));

  /** A stub that answers 204 and records the JSON bodies the CLI POSTs. */
  async function stub() {
    const got: unknown[][] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try { got.push(...(JSON.parse(body) as unknown[][])); } catch { /* ignore */ }
        res.writeHead(204).end();
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address() as { port: number };
    return { url: `http://127.0.0.1:${addr.port}`, got };
  }

  // Async spawn: a synchronous child would block this process, and the stub server could never answer.
  const emitAsync = (args: string[], input?: string) =>
    new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [CLI, 'emit', ...args], { stdio: ['pipe', 'ignore', 'inherit'] });
      child.on('error', fail);
      child.on('close', () => done());
      child.stdin.end(input ?? '');
    });

  it('forwards the identity flags as event fields', async () => {
    const { url, got } = await stub();
    await emitAsync([
      '--url', url, '--kind', 'log',
      '--user', 'ada', '--machine', 'box-1', '--runtime', 'claude-code/aws', '--session', 's1', '--project-name', 'flow',
    ]);
    expect(got).toEqual([expect.objectContaining({ kind: 'log', user: 'ada', host: 'box-1', runtime: 'claude-code/aws', session: 's1', project: 'flow' })]);
  });

  it('fills user and host defaults when the event carries none', async () => {
    const { url, got } = await stub();
    await emitAsync(['--url', url, '--kind', 'log']);
    expect(got).toEqual([expect.objectContaining({ user: userInfo().username, host: hostname() })]);
  });

  it('lets a payload user win over the default', async () => {
    const { url, got } = await stub();
    await emitAsync(['--url', url], JSON.stringify({ kind: 'log', user: 'grace', host: 'custom-host' }));
    expect(got).toEqual([expect.objectContaining({ user: 'grace', host: 'custom-host' })]);
  });

  it('clips long identity fields', async () => {
    const { url, got } = await stub();
    await emitAsync(['--url', url, '--kind', 'log', '--user', 'u'.repeat(IDENTITY_MAX + 50)]);
    expect(got).toEqual([expect.objectContaining({ user: `${'u'.repeat(IDENTITY_MAX - 1)}…` })]);
  });
});

describe('emit identity defaults (#82)', () => {
  const os = { username: 'ada', hostname: 'box-1' };

  it.each(['http://127.0.0.1:5317', 'http://localhost:5317', 'http://[::1]:5317'])(
    'adds the os user and hostname for the loopback target %s',
    (url) => {
      expect(identityDefaults(url, {}, os)).toEqual({ user: 'ada', host: 'box-1' });
    },
  );

  it.each(['https://tower.example.com', 'http://10.0.0.7:5317', 'not a url'])(
    'sends nothing by default to %s',
    (url) => {
      expect(identityDefaults(url, {}, os)).toEqual({ user: undefined, host: undefined });
    },
  );

  it('sends what the env asks for, even to a remote host', () => {
    expect(identityDefaults('https://tower.example.com', { FLOW_TOWER_USER: 'grace', FLOW_TOWER_MACHINE: 'box-2' }, os))
      .toEqual({ user: 'grace', host: 'box-2' });
  });

  it('treats an empty FLOW_TOWER_USER as "no user", everywhere', () => {
    expect(identityDefaults('http://127.0.0.1:5317', { FLOW_TOWER_USER: '' }, os)).toEqual({ user: undefined, host: 'box-1' });
    expect(identityDefaults('https://tower.example.com', { FLOW_TOWER_USER: '' }, os)).toEqual({ user: undefined, host: undefined });
  });
});

describe('cli token (#83)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-tokens-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  // The CLI keeps its tokens under userHome(): FLOW_TOWER_HOME points that at a temp folder, never the repo.
  const token = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'token', ...args], { encoding: 'utf8', env: { ...process.env, FLOW_TOWER_HOME: home } });

  it('adds a token, prints it once with the hash warning, then never again', () => {
    const added = token('add', 'alice');
    expect(added.status).toBe(0);
    const [secret] = added.stdout.split('\n');
    expect(secret).toMatch(/^ft_alice_[A-Za-z0-9_-]{43}$/);
    expect(added.stdout).toContain('shown once');
    expect(added.stdout).toContain('sha256');

    // list shows the sender and its dates, but never the secret or its hash.
    const list = token('list');
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('alice');
    expect(list.stdout).toContain('active');
    expect(list.stdout).not.toContain(secret);

    // The file underneath holds a hash, not the plaintext.
    expect(readFileSync(join(home, 'tokens.json'), 'utf8')).not.toContain(secret);
  });

  it('revokes and resumes, and refuses an unknown id with exit 1', () => {
    token('add', 'bob');
    expect(token('pause', 'bob').stdout).toContain('paused');
    expect(token('list').stdout).toContain('paused');
    expect(token('resume', 'bob').stdout).toContain('resumed');
    expect(token('revoke', 'bob').stdout).toContain('revoked');
    expect(token('list').stdout).toContain('revoked');

    const unknown = token('revoke', 'ghost');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('unknown token');
  });
});

describe('cli history (#84)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-history-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  // The DB path is userHome()/history.db: FLOW_TOWER_HOME points that at a temp folder, never the repo.
  const history = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'history', ...args], { encoding: 'utf8', env: { ...process.env, FLOW_TOWER_HOME: home } });
  const path = join(home, 'history.db');

  /** Two users' events, written through the store so the rollups are populated like a real run. */
  const seed = async () => {
    const opened = await openHistory(path);
    if ('disabled' in opened) return false;
    const ts = Date.now();
    const ev = (x: object, at: number) => ({ ...FlowEventSchema.parse(x), id: 1, ts: at, targets: [] }) as FlowEvent;
    // Distinct timestamps: the export orders by ts, and a tie would make the line order non-deterministic.
    // `call` gives each event a dedupe key, so seeding again from another test adds nothing (INSERT OR IGNORE).
    createHistory(opened.db).write([
      ev({ kind: 'usage', user: 'alice', model: 'gpt-5', call: 'seed-alice', tokens_detail: { input: 10 }, cost_usd: 0.25 }, ts),
      ev({ kind: 'usage', user: 'bob', model: 'gpt-5', call: 'seed-bob', tokens_detail: { input: 3 } }, ts + 1),
    ]);
    opened.db.close();
    return true;
  };

  it('exports one JSONL line per row, filtered by --user, without any content', async () => {
    if (!(await seed())) return; // no node:sqlite on this Node: the feature is off, nothing to export
    const all = history('export');
    expect(all.status).toBe(0);
    expect(all.stdout.trim().split('\n').map((l) => JSON.parse(l).user)).toEqual(['alice', 'bob']);

    const alice = history('export', '--user', 'alice');
    const [row] = alice.stdout.trim().split('\n').map((l) => JSON.parse(l));
    expect(row).toMatchObject({ user: 'alice', model: 'gpt-5', in_tok: 10 });
    // The export line carries the allow-listed columns only: no message/prompt/path could be there.
    expect(Object.keys(row).sort()).toEqual([...COLUMNS].sort());
  });

  it('deletes only that user rows from events and both rollups, then says how many went', async () => {
    if (!(await seed())) return;
    const del = history('delete', '--user', 'alice');
    expect(del.status).toBe(0);
    expect(del.stdout).toContain('deleted 1 events');
    // 2 rollup rows: one hourly and one daily bucket for that user.
    expect(del.stdout).toContain('2 rollup rows for user "alice"');

    expect(history('export', '--user', 'alice').stdout.trim()).toBe('');
    const others = history('export').stdout.trim().split('\n').map((l) => JSON.parse(l).user);
    expect(others).toEqual(['bob']);
    // The rollups keep the other user, so a delete is per-user and not a wipe.
    expect(history('info').stdout).toContain('bob');
  });

  it('info reports the path, row count and retention defaults', () => {
    const r = history('info');
    // Without node:sqlite the CLI exits 1 with the reason, never a stack.
    if (r.status !== 0) return expect(r.stderr).toContain('Node >= 22.13');
    expect(r.stdout).toContain(path);
    expect(r.stdout).toContain(`retention: ${RETENTION.defaultDays} days raw (max ${RETENTION.maxDays})`);
  });

  it('refuses a delete without --user', () => {
    const r = history('delete');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: flow-tower history');
  });
});

describe('cli serve guards (#83)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-serve-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  // An empty FLOW_TOWER_HOME (and no FLOW_TOWER_TOKEN) means no active per-sender token exists.
  const serve = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'serve', ...args], {
      encoding: 'utf8',
      env: { ...process.env, FLOW_TOWER_HOME: home, FLOW_TOWER_TOKEN: '', FLOW_TOWER_ALLOWED_HOSTS: '' },
    });

  it('refuses --allowed-host without --hub', () => {
    const r = serve('--allowed-host', 'hub.tailnet-xyz.ts.net', '--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('reachable through a proxy');

    // The env var behaves the same as the flag.
    const viaEnv = spawnSync(process.execPath, [CLI, 'serve', '--no-open'], {
      encoding: 'utf8',
      env: { ...process.env, FLOW_TOWER_HOME: home, FLOW_TOWER_TOKEN: '', FLOW_TOWER_ALLOWED_HOSTS: 'hub.tailnet-xyz.ts.net' },
    });
    expect(viaEnv.status).toBe(1);
    expect(viaEnv.stderr).toContain('add --hub (and a token)');
  });

  it('refuses --ingest-only without any token, like --hub', () => {
    const r = serve('--ingest-only', '--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--ingest-only needs a token');
  });
});

describe('cli validate', () => {
  it('passes on the examples and reports JSON', () => {
    const r = run('validate', 'examples/dev-squad', '--json');
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.projects).toEqual(['dev-squad.tower.yaml']);
  });

  it('fails with exit 1 on errors', () => {
    const r = run('validate', 'tests/fixtures/broken.tower.yaml');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('unknown agent "ghost"');
  });
});

describe('cli guide', () => {
  it('prints the procedure with this checkout filled in', () => {
    const r = run('guide');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Generate a tower from a codebase');
    expect(r.stdout).toContain(`node ${CLI} validate <tower-file> --json`);
    expect(r.stdout).toContain(`](${resolve('skills/flow-tower/reference.md')})`);
  });
});

describe('cli install-skill', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'flow-tower-skill-'));
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));
  const install = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'install-skill', ...args, '--project'], { cwd, encoding: 'utf8' });

  it.each([
    ['claude', '.claude/skills'],
    ['codex', '.agents/skills'],
    ['pi', '.pi/skills'],
    ['hermes', '.hermes/skills'],
  ])('--target %s installs into ./%s', (target, dir) => {
    const r = install('--target', target);
    expect(r.status).toBe(0);
    const skill = join(cwd, dir, 'flow-tower');
    for (const f of ['SKILL.md', 'reference.md', 'procedure.md']) expect(existsSync(join(skill, f))).toBe(true);
    const md = readFileSync(join(skill, 'SKILL.md'), 'utf8');
    expect(md).not.toContain('{{FLOW_TOWER_CLI}}');
    expect(md).toContain(`node ${CLI} validate`);
    expect(md).toContain('](procedure.md)');
    const proc = readFileSync(join(skill, 'procedure.md'), 'utf8');
    expect(proc).toContain('](reference.md)');
    expect(proc).not.toContain('<flow-tower>/');

    const costs = join(cwd, dir, 'flow-tower-costs');
    for (const f of ['SKILL.md', 'reference.md', 'models.mjs']) expect(existsSync(join(costs, f))).toBe(true);
    const costsMd = readFileSync(join(costs, 'SKILL.md'), 'utf8');
    expect(costsMd).not.toContain('{{FLOW_TOWER_CLI}}');
    expect(costsMd).not.toContain('](../../');
    expect(costsMd).toContain('](../flow-tower/SKILL.md)');
    expect(costsMd).toContain(`](${resolve('docs/realtime.md')})`);
    expect(readFileSync(join(costs, 'reference.md'), 'utf8')).not.toContain('](../../');
  });

  it('rejects an unknown target', () => {
    const r = install('--target', 'nope');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown target');
  });
});
