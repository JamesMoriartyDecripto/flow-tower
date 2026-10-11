import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, hostname, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { IDENTITY_MAX, identityDefaults } from '../bin/identity.js';

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
