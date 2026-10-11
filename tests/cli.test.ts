import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, hostname, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { IDENTITY_MAX, identityDefaults } from '../bin/identity.js';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';
import { openHistory } from '../src/server/history/db';
import { COLUMNS, createHistory, RETENTION } from '../src/server/history/store';

const CLI = resolve('bin/flow-tower.js');
// A hung CLI would otherwise block this process forever: the timeout lets the test fail instead of the run.
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20_000 });

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
      // The timeout kills a stuck child, so the promise settles and the test fails instead of hanging.
      const child = spawn(process.execPath, [CLI, 'emit', ...args], { stdio: ['pipe', 'ignore', 'inherit'], timeout: 20_000 });
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
    spawnSync(process.execPath, [CLI, 'token', ...args], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, FLOW_TOWER_HOME: home } });

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
    spawnSync(process.execPath, [CLI, 'history', ...args], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, FLOW_TOWER_HOME: home } });
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

  it("deletes the no-user rows with --user '', old NULL rows included", async () => {
    if (!(await seed())) return;
    const opened = await openHistory(path);
    if ('disabled' in opened) return;
    const ts = Date.now() + 5;
    createHistory(opened.db).write([{ ...FlowEventSchema.parse({ kind: 'usage', model: 'gpt-5', call: 'seed-nouser', tokens: 5 }), id: 1, ts, targets: [] } as FlowEvent]);
    // A row an older build wrote before the writer used '' for unknown: it must go with the same delete.
    opened.db.prepare("INSERT INTO events (ts, user, kind) VALUES (?, NULL, 'log')").run(ts);
    opened.db.close();

    const del = history('delete', '--user', '');
    expect(del.status).toBe(0);
    expect(del.stdout).toContain('deleted 2 events');

    const reopened = await openHistory(path);
    if ('disabled' in reopened) return;
    const left = reopened.db.prepare('SELECT user FROM events').all() as { user: string }[];
    // '' and NULL are both gone from every table; the named users are never touched.
    expect(left.map((r) => r.user).sort()).toEqual(['alice', 'bob']);
    const rollups = (reopened.db.prepare("SELECT count(*) AS n FROM rollup_hourly WHERE user = '' OR user IS NULL").get() as { n: number }).n;
    expect(rollups).toBe(0);
    reopened.db.close();
  });
});

describe('cli serve guards (#83)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-serve-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  // An empty FLOW_TOWER_HOME (and no FLOW_TOWER_TOKEN) means no active per-sender token exists.
  const serve = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'serve', ...args], {
      encoding: 'utf8',
      // A serve that starts instead of refusing would never exit: fail the test, not the whole run.
      timeout: 20_000,
      env: { ...process.env, FLOW_TOWER_HOME: home, FLOW_TOWER_TOKEN: '', FLOW_TOWER_ALLOWED_HOSTS: '' },
    });

  it('refuses --allowed-host without --hub', () => {
    const r = serve('--allowed-host', 'hub.tailnet-xyz.ts.net', '--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('reachable through a proxy');

    // The env var behaves the same as the flag.
    const viaEnv = spawnSync(process.execPath, [CLI, 'serve', '--no-open'], {
      encoding: 'utf8',
      timeout: 20_000,
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

describe('cli config (#90)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-config-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  // FLOW_TOWER_HOME points userHome() at a temp folder, so nothing here touches the real config.
  const config = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'config', ...args], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, FLOW_TOWER_HOME: home } });
  const write = (content: string) => writeFileSync(join(home, 'config.json'), content, { mode: 0o600 });

  it('show redacts the token, never printing its value', () => {
    write('{ "url": "https://hub.example.com", "token": "ft_secret_shouldnotappear" }');
    const r = config('show');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('https://hub.example.com');
    expect(r.stdout).toContain('ft_…redacted');
    expect(r.stdout).not.toContain('ft_secret_shouldnotappear');
  });

  it('path names the files in use', () => {
    const r = config('path');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(join(home, 'config.json'));
  });
});

describe('cli serve reads the config file (#90)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-serve-config-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const serve = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'serve', ...args], {
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, FLOW_TOWER_HOME: home, FLOW_TOWER_TOKEN: '', FLOW_TOWER_ALLOWED_HOSTS: '', FLOW_TOWER_HUB: '' },
    });
  const write = (content: string) => writeFileSync(join(home, 'config.json'), content, { mode: 0o600 });

  it('takes hub from the config and still refuses a hub without a token', () => {
    write('{ "hub": true }');
    const r = serve('--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('hub mode needs a token');
  });

  it('takes allowedHosts from the config, so a proxy host without a hub is refused', () => {
    write('{ "allowedHosts": ["hub.tailnet-xyz.ts.net"] }');
    const r = serve('--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('reachable through a proxy');
  });

  it('ignores the config token for hub mode: it is the sender credential, not this server secret', () => {
    write('{ "hub": true, "token": "ft_sender_secret" }');
    const r = serve('--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('hub mode needs a token');
  });

  it('lets a --hub flag win over a config that says no', () => {
    write('{ "hub": false }');
    const r = serve('--hub', '--no-open');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('hub mode needs a token');
  });
});

describe('cli emit reads the config file (#90)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-emit-config-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  it('sends the config url, user and token', async () => {
    const got: { body: unknown[]; token?: string }[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        got.push({ body: JSON.parse(body) as unknown[], token: req.headers['x-flow-tower-token'] as string | undefined });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    writeFileSync(join(home, 'config.json'), JSON.stringify({ url: `http://127.0.0.1:${port}`, user: 'config-user', token: 'ft_cfg_secret' }), { mode: 0o600 });

    await new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [CLI, 'emit', '--kind', 'log'], {
        stdio: ['pipe', 'ignore', 'inherit'],
        // The timeout kills a stuck child, so the promise settles and the test fails instead of hanging.
        timeout: 20_000,
        env: { ...process.env, FLOW_TOWER_HOME: home, FLOW_TOWER_TOKEN: '', FLOW_TOWER_URL: '' },
      });
      child.on('error', fail);
      child.on('close', () => done());
      child.stdin.end('');
    });
    server.close();

    expect(got).toHaveLength(1);
    expect(got[0].token).toBe('ft_cfg_secret');
    expect(got[0].body).toEqual([expect.objectContaining({ kind: 'log', user: 'config-user' })]);
  });
});

describe('cli emit on a satellite (#91)', () => {
  const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-emit-sat-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  /** A stub that records each POST's token header, so a test can assert what the CLI sent where. */
  async function stub() {
    const got: { token?: string; url: string }[] = [];
    const server = createServer((req, res) => {
      got.push({ token: req.headers['x-flow-tower-token'] as string | undefined, url: req.url ?? '' });
      req.on('data', () => {});
      req.on('end', () => res.writeHead(204).end());
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    return { url: `http://127.0.0.1:${port}`, got, close: () => server.close() };
  }

  const emitAgainst = (target: string, args: string[] = []) =>
    new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [CLI, 'emit', '--url', target, '--kind', 'log', ...args], {
        stdio: ['pipe', 'ignore', 'inherit'],
        // The timeout kills a stuck child, so the promise settles and the test fails instead of hanging.
        timeout: 20_000,
        env: { ...process.env, FLOW_TOWER_HOME: home, FLOW_TOWER_TOKEN: '', FLOW_TOWER_URL: '' },
      });
      child.on('error', fail);
      child.on('close', () => done());
      child.stdin.end('');
    });

  it('posts to the local server with no token, leaving the hub token to the relay', async () => {
    const local = await stub();
    // A satellite config: url/token name the HUB; emit must not send them to the local relay.
    writeFileSync(join(home, 'config.json'), JSON.stringify({ role: 'satellite', url: 'https://hub.example.com', token: 'ft_hub_secret' }), { mode: 0o600 });
    await emitAgainst(local.url);
    local.close();

    expect(local.got).toHaveLength(1);
    expect(local.got[0].token).toBeUndefined();
  });

  it('never sends the config token to a different origin named by --url', async () => {
    const other = await stub();
    // Non-satellite: the config url is the hub, but --url points elsewhere: the hub token must not follow.
    writeFileSync(join(home, 'config.json'), JSON.stringify({ url: 'https://hub.example.com', token: 'ft_hub_secret' }), { mode: 0o600 });
    await emitAgainst(other.url);
    other.close();

    expect(other.got).toHaveLength(1);
    expect(other.got[0].token).toBeUndefined();
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

describe('cli copy (#116)', () => {
  const out = mkdtempSync(join(tmpdir(), 'flow-tower-copy-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));
  // A copy validates the result by running `flow-tower validate`, so it spawns the CLI once more.
  const copy = (...args: string[]) => spawnSync(process.execPath, [CLI, 'copy', ...args], { encoding: 'utf8', timeout: 20_000 });

  it('--list names every example with its tower name', () => {
    const r = copy('--list');
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toContain('dev-squad — Dev Squad');
    expect(lines).toContain('starters/rag-bot — Docs Q&A Bot');
  });

  it('copies an example into a new folder and validates the copy', () => {
    const dest = join(out, 'rag-bot');
    const r = copy('starters/rag-bot', dest);
    expect(r.status).toBe(0);
    expect(existsSync(join(dest, 'rag-bot.tower.yaml'))).toBe(true);
    expect(existsSync(join(dest, 'prompts/answer.md'))).toBe(true);
    expect(r.stdout).toContain('validation: 1 tower(s), 0 error(s)');
    expect(r.stdout).toContain('flow-tower');
  });

  it('refuses a dest that exists and is not empty', () => {
    const dest = join(out, 'not-empty');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'keep.txt'), 'mine');
    const r = copy('starters/rag-bot', dest);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not empty');
  });

  it('refuses an unknown example', () => {
    const r = copy('nope', join(out, 'nope'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown example');
  });

  it('refuses a dest inside the checkout examples folder', () => {
    const r = copy('starters/rag-bot', resolve('examples/tmp-copy-should-not-exist'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('inside');
  });

  it('warns that a root: ../.. example points at the flow-tower repo', () => {
    const r = copy('docs-qa', join(out, 'docs-qa'));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('root: ../..');
    expect(r.stdout).toMatch(/point at the flow-tower checkout/);
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
    spawnSync(process.execPath, [CLI, 'install-skill', ...args, '--project'], { cwd, encoding: 'utf8', timeout: 20_000 });

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
