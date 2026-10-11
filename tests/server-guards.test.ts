import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { readTowerFile } from '../src/server/files';
import { crossSite, isJson } from '../src/server/guard';
import { createEventHub } from '../src/server/events';
import { tokenStore } from '../src/server/tokens';

const req = (headers: Record<string, string>) => ({ headers: { host: '127.0.0.1:5317', ...headers } }) as unknown as IncomingMessage;

/** Auth on ingest (#83): the hub answers as before without a secret, and holds tokens when there are any. */
describe('auth on ingest (#83)', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterAll(() => servers.forEach((s) => s.close()));

  /** A hub over a temp user folder, listening on a real port: only a real server can test headers. */
  async function start(opts: { legacy?: string; home?: string } = {}) {
    const home = opts.home ?? mkdtempSync(join(tmpdir(), 'flow-tower-auth-'));
    const hub = createEventHub(() => undefined, () => undefined, { legacy: opts.legacy, home });
    const server = createServer((rq, rs) => hub.handle(rq, rs));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/events`, hub, home };
  }
  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  it('accepts an unsigned event when no token exists anywhere (local only)', async () => {
    const { url, hub } = await start();
    const r = await post(url, { kind: 'log', message: 'hi' });
    expect(r.status).toBe(204);
    expect(await r.text()).toBe(''); // Claude Code hooks read the body: it must stay empty
    expect(hub.recent().at(-1)).toMatchObject({ kind: 'log', message: 'hi' });
    expect(hub.recent().at(-1)!.sender).toBeUndefined();
  });

  it('accepts the legacy token and refuses a wrong one', async () => {
    const { url, hub } = await start({ legacy: 'shared-secret' });
    expect((await post(url, { kind: 'log' }, { 'x-flow-tower-token': 'shared-secret' })).status).toBe(204);
    expect(hub.recent().at(-1)).toMatchObject({ sender: 'default', user: 'default' });
    // Bearer works too (the OTel Collector and proxies set it that way).
    expect((await post(url, { kind: 'log' }, { Authorization: 'Bearer shared-secret' })).status).toBe(204);
    expect((await post(url, { kind: 'log' })).status).toBe(401);
    expect((await post(url, { kind: 'log' }, { 'x-flow-tower-token': 'nope' })).status).toBe(401);
  });

  it('lets a per-sender token through and makes its id win over the payload', async () => {
    const { url, hub, home } = await start();
    const { token } = tokenStore(home).create('alice');
    const r = await post(url, { kind: 'log', user: 'bob', sender: 'mallory' }, { 'x-flow-tower-token': token });
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
    expect(hub.recent().at(-1)).toMatchObject({ sender: 'alice', user: 'alice' });
  });

  it('refuses a revoked token with 401 and ingests nothing', async () => {
    const { url, hub, home } = await start();
    const store = tokenStore(home);
    const { token } = store.create('carol');
    store.revoke('carol');
    const r = await post(url, { kind: 'log' }, { 'x-flow-tower-token': token });
    expect(r.status).toBe(401);
    expect(hub.recent()).toHaveLength(0);
  });
});

describe('server guards (security review of #62)', () => {
  it('reads the content type by its exact essence', () => {
    expect(isJson(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
    expect(isJson(req({ 'content-type': 'text/plain;x=application/json' }))).toBe(false);
  });

  it('tells browser requests from other sites apart from local tools', () => {
    expect(crossSite(req({}))).toBe(false); // curl, hooks, OTLP exporters
    expect(crossSite(req({ origin: 'http://127.0.0.1:5317', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(crossSite(req({ origin: 'http://localhost:3000' }))).toBe(true);
    expect(crossSite(req({ 'sec-fetch-site': 'same-site' }))).toBe(true);
  });

  it('never serves secret files, even inside a tower root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
    for (const f of ['.env', '.env.local', 'id_rsa', 'server.key', 'notes.md']) writeFileSync(join(dir, f), 'x');
    for (const f of ['.env', '.env.local', 'id_rsa', 'server.key', './.env', 'sub/../.env']) {
      expect((await readTowerFile(dir, f)).status, f).toBe(403);
    }
    expect((await readTowerFile(dir, 'notes.md')).status).toBe(200);
  });

  it('knows the usual credential files and folders (round 2)', async () => {
    const { isSecretPath } = await import('../src/server/files');
    for (const p of ['.envrc', '.git-credentials', '.dev.vars', '.aws/credentials', 'home/.ssh/config', '.kube/config', 'prod.tfvars', '.config/gcloud/x.json']) {
      expect(isSecretPath(p), p).toBe(true);
    }
    for (const p of ['.claude/agents/coder.md', '.mcp.json', 'src/config.ts', 'docs/keys.md']) expect(isSecretPath(p), p).toBe(false);
  });
});

describe('the loader never reads secrets or the user folder (#68 security review)', () => {
  it('reports a prompt file that is a key file or lives in the user folder, and does not read it', async () => {
    const { loadLibrary } = await import('../src/core/loader');
    const { env } = await import('node:process');
    const { mkdirSync } = await import('node:fs');
    const project = mkdtempSync(join(tmpdir(), 'flow-tower-project-'));
    mkdirSync(join(project, 'home'));
    writeFileSync(join(project, 'home', 'voice-journal.jsonl'), 'PERSONAL TRANSCRIPT');
    writeFileSync(join(project, 'api.key'), 'SECRET KEY');
    writeFileSync(join(project, 'ok.md'), 'A real prompt.');
    writeFileSync(join(project, 't.tower.yaml'), [
      'name: T',
      'prompts:',
      '  journal: { file: home/voice-journal.jsonl }',
      '  key: { file: api.key }',
      '  ok: { file: ok.md }',
      'layers:',
      '  - id: l',
      '    title: L',
      '    nodes:',
      '      - { id: a, label: A, prompt: journal }',
      '      - { id: b, label: B, prompt: key }',
      '      - { id: c, label: C, prompt: ok }',
    ].join('\n'));
    const saved = env.FLOW_TOWER_HOME;
    env.FLOW_TOWER_HOME = join(project, 'home');
    try {
      const { workspace } = await loadLibrary([project]);
      const json = JSON.stringify(workspace);
      expect(json).not.toContain('PERSONAL TRANSCRIPT');
      expect(json).not.toContain('SECRET KEY');
      expect(json).toContain('A real prompt.');
      const issues = Object.values(workspace.towers).flatMap((t) => t.issues.map((i) => i.message));
      expect(issues.filter((m) => m.includes('secret file or in the user folder'))).toHaveLength(2);
    } finally {
      if (saved === undefined) delete env.FLOW_TOWER_HOME; else env.FLOW_TOWER_HOME = saved;
    }
  });
});

describe('tower files themselves (#68 security review, round 2)', () => {
  it('never read a tower file that links into the user folder, nor scan a linked folder there', async () => {
    const { loadLibrary } = await import('../src/core/loader');
    const { env } = await import('node:process');
    const { mkdirSync, symlinkSync } = await import('node:fs');
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-home-'));
    const journal = 'heard: [PERSONAL TRANSCRIPT\n  - "ciao: x" ]: :\n';
    writeFileSync(join(home, 'voice-journal.jsonl'), journal);
    writeFileSync(join(home, 'private.tower.yaml'), 'name: PRIVATE TOWER\nlayers: []\n');
    writeFileSync(join(home, 'api.key'), 'SECRET KEY');
    const project = mkdtempSync(join(tmpdir(), 'flow-tower-project-'));
    mkdirSync(join(project, '.git'));
    symlinkSync(join(home, 'voice-journal.jsonl'), join(project, 'evil.tower.yaml'));
    symlinkSync(home, join(project, 'linked'));
    symlinkSync(join(home, 'api.key'), join(project, 'api.key'));
    writeFileSync(join(project, 'ok.tower.yaml'), 'name: OK\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: a, label: A, files: [api.key] }\n');
    const saved = env.FLOW_TOWER_HOME;
    env.FLOW_TOWER_HOME = home;
    try {
      const scanned = await loadLibrary([project]);
      expect(Object.keys(scanned.workspace.towers)).toEqual(['ok.tower.yaml']); // neither the link nor the linked folder
      const json = JSON.stringify(scanned.workspace);
      expect(json).not.toContain('PRIVATE TOWER');
      // Existence of a secret file is not probed: reported as secret, not as present or missing.
      expect(json).toContain('api.key is a secret file');
      // Named directly, the linked file is refused before it is read: no YAML error quoting the journal.
      const direct = await loadLibrary([join(project, 'evil.tower.yaml')]);
      const out = JSON.stringify(direct.workspace);
      expect(out).not.toContain('PERSONAL');
      expect(out).toMatch(/secret file or in the user folder|outside the project/);
    } finally {
      if (saved === undefined) delete env.FLOW_TOWER_HOME; else env.FLOW_TOWER_HOME = saved;
    }
  });
});

describe('folder scans (#68 final audit)', () => {
  it('never follows symlinked folders: three links to ".." still scan quickly to the one tower', async () => {
    const { findTowerFiles } = await import('../src/core/loader');
    const { mkdirSync, symlinkSync } = await import('node:fs');
    const project = mkdtempSync(join(tmpdir(), 'flow-tower-loops-'));
    mkdirSync(join(project, 'd'));
    for (const l of ['a', 'b', 'c']) symlinkSync('..', join(project, 'd', l));
    writeFileSync(join(project, 'only.tower.yaml'), 'name: Only\nlayers: []\n');
    const started = performance.now();
    expect(findTowerFiles([project]).map((f) => f.slice(project.length + 1))).toEqual(['only.tower.yaml']);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('knows the user folder whatever the case it is written in (case-insensitive disks)', async ({ skip }) => {
    const { loadLibrary } = await import('../src/core/loader');
    const { env } = await import('node:process');
    const { existsSync, mkdirSync } = await import('node:fs');
    const project = mkdtempSync(join(tmpdir(), 'flow-tower-case-'));
    mkdirSync(join(project, 'myhome'));
    if (!existsSync(join(project, 'MYHOME'))) skip(); // a case-sensitive disk: two different folders
    writeFileSync(join(project, 'myhome', 'private.tower.yaml'), 'name: PRIVATE TOWER\nlayers: []\n');
    writeFileSync(join(project, 'ok.tower.yaml'), 'name: OK\nlayers: []\n');
    const saved = env.FLOW_TOWER_HOME;
    env.FLOW_TOWER_HOME = join(project, 'MYHOME');
    try {
      const scanned = await loadLibrary([project]);
      expect(Object.keys(scanned.workspace.towers)).toEqual(['ok.tower.yaml']);
      const direct = await loadLibrary([join(project, 'myhome', 'private.tower.yaml')]);
      const out = JSON.stringify(direct.workspace);
      expect(out).not.toContain('PRIVATE TOWER');
      expect(out).toContain('secret file or in the user folder');
    } finally {
      if (saved === undefined) delete env.FLOW_TOWER_HOME; else env.FLOW_TOWER_HOME = saved;
    }
  });
});
