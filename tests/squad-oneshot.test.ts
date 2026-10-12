import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN = 'tools/squad/run.mjs';
const ANSWER = 'REVIEW: looks fine';
const SPAWN = { timeout: 60_000 };

type Seen = { method: string; url: string; body: Record<string, unknown> | undefined };

// A stub OpenRouter: the chat endpoint answers once; the batch endpoints answer a batch that is already completed,
// so batchOne never reaches its 30 s poll sleep. Every request is recorded for the assertions.
let server: Server;
let base = '';
let seen: Seen[] = [];
// Set by one test: the batch create answers the "no batch endpoint" refusal that OpenRouter gives some models.
let refuseBatch = false;

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : undefined;
      seen.push({ method: req.method ?? '', url: req.url ?? '', body });
      const send = (obj: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url?.endsWith('/chat/completions')) {
        return send({ choices: [{ message: { content: ANSWER } }], usage: { cost: 0.0042, prompt_tokens: 100 } });
      }
      if (req.method === 'POST' && req.url?.endsWith('/batches') && refuseBatch) {
        return send({ error: { message: "Model 'vendor-a/model-x' does not have a :batch endpoint.", code: 400 } }, 400);
      }
      if (req.method === 'POST' && req.url?.endsWith('/batches')) {
        return send({
          id: 'batch-1', status: 'completed',
          results: [{ custom_id: 'squad', response: { status_code: 200, body: { choices: [{ message: { content: ANSWER } }], usage: { cost: 0.0021, prompt_tokens: 100 } } } }],
        });
      }
      send({ id: 'batch-1', status: 'completed' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

type Result = { code: number; stdout: string; stderr: string };

// Async on purpose: the stub lives in this process, so a blocking spawn would deadlock the server.
function run(args: string[], env: Record<string, string> = {}, ledger: string): Promise<Result> {
  const childEnv: Record<string, string> = { ...(process.env as Record<string, string>), OPENROUTER_API_KEY: 'test-key', SQUAD_API_BASE: base, SQUAD_LEDGER: ledger, ...env };
  if (!('SQUAD_PACE' in env)) delete childEnv.SQUAD_PACE;
  return new Promise((resolve) => {
    execFile('node', [RUN, ...args], { env: childEnv, encoding: 'utf8', timeout: 60_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'squad-oneshot-'));
  const task = join(dir, 'task.md');
  writeFileSync(task, 'Review this diff: +const x = 1;');
  const ledger = join(dir, 'ledger.jsonl');
  const args = ['--model', 'vendor-a/model-x', '--node', 'specialists.reviewer', '--task', task, '--issue', '169'];
  return { ledger, args };
}

describe('squad --oneshot and --batch', () => {
  it('oneshot: one request with no tools, the answer on stdout, a oneshot ledger line', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'reviewer', '--oneshot', ...args], {}, ledger);
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('mode: oneshot');
    expect(r.stdout).toContain(ANSWER);
    expect(r.stdout).toMatch(/--- vendor-a\/model-x · 1 step · \$0\.0042/);

    const chats = seen.filter((s) => s.url.endsWith('/chat/completions'));
    expect(chats).toHaveLength(1);
    expect(chats[0].body).not.toHaveProperty('tools');
    expect(chats[0].body?.usage).toEqual({ include: true });
    expect(JSON.stringify(chats[0].body?.messages)).toContain('You have no tools');

    const row = JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');
    expect(row).toMatchObject({ mode: 'oneshot', steps: 1, cost: 0.0042, role: 'reviewer', outcome: 'finish', issue: '169' });
  });

  it('coder with --oneshot exits 1 with the reason and makes no request', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'coder', '--oneshot', ...args], {}, ledger);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('the coder needs tools: --oneshot/--batch are for reviewer and security');
    expect(seen).toHaveLength(0);
  });

  it('SQUAD_PACE=relaxed makes a reviewer oneshot: one chat request, no batch call', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'reviewer', ...args], { SQUAD_PACE: 'relaxed' }, ledger);
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('mode: oneshot (SQUAD_PACE=relaxed)');
    expect(r.stdout).toContain(ANSWER);
    expect(r.stdout).toMatch(/--- vendor-a\/model-x · 1 step · \$0\.0042/);
    expect(seen.filter((s) => s.url.endsWith('/chat/completions'))).toHaveLength(1);
    expect(seen.some((s) => s.url.includes('/batches'))).toBe(false);

    const row = JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');
    expect(row).toMatchObject({ mode: 'oneshot', steps: 1, outcome: 'finish' });
  });

  it('SQUAD_PACE=overnight makes a reviewer batch, and the batch is deleted', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'reviewer', ...args], { SQUAD_PACE: 'overnight' }, ledger);
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('mode: batch (SQUAD_PACE=overnight)');
    expect(r.stdout).toContain(ANSWER);
    expect(r.stdout).toMatch(/--- vendor-a\/model-x · 1 step · \$0\.0021 .*\(batch\)/);
    expect(seen.some((s) => s.method === 'DELETE' && s.url.endsWith('/batches/batch-1'))).toBe(true);

    const row = JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');
    expect(row).toMatchObject({ mode: 'batch', steps: 1, outcome: 'finish' });
  });

  it('an unknown SQUAD_PACE value exits 1 and makes no request', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'reviewer', ...args], { SQUAD_PACE: 'daily' }, ledger);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('SQUAD_PACE must be now, relaxed or overnight');
    expect(seen).toHaveLength(0);
  });

  it('the coder ignores SQUAD_PACE and runs the tool loop', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'coder', ...args], { SQUAD_PACE: 'relaxed' }, ledger);
    expect(r.stdout.split('\n')[0]).toBe('mode: loop');
    const chats = seen.filter((s) => s.url.endsWith('/chat/completions'));
    expect(chats[0].body).toHaveProperty('tools');
    expect(seen.some((s) => s.url.includes('/batches'))).toBe(false);
  });

  it('an explicit flag wins over SQUAD_PACE=relaxed', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'security', '--oneshot', ...args], { SQUAD_PACE: 'relaxed' }, ledger);
    expect(r.stdout.split('\n')[0]).toBe('mode: oneshot');
    expect(seen.some((s) => s.method === 'POST' && s.url.endsWith('/batches'))).toBe(false);
  });

  it('--batch on a model with no batch endpoint falls back to oneshot, one chat request, and the ledger says oneshot', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    refuseBatch = true;
    try {
      const r = await run(['--role', 'reviewer', '--batch', ...args], {}, ledger);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('vendor-a/model-x has no batch endpoint: falling back to --oneshot (full price)');
      expect(r.stdout).toContain(ANSWER);
      expect(r.stdout).toMatch(/--- vendor-a\/model-x · 1 step · \$0\.0042 · cache/);
      expect(r.stdout).not.toMatch(/\(batch\)/);
      const chats = seen.filter((s) => s.url.endsWith('/chat/completions'));
      expect(chats).toHaveLength(1);
      const row = JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');
      expect(row).toMatchObject({ mode: 'oneshot', outcome: 'finish', steps: 1 });
    } finally {
      refuseBatch = false;
    }
  });

  it('the default stays the tool loop', SPAWN, async () => {
    const { ledger, args } = setup();
    seen = [];
    const r = await run(['--role', 'reviewer', ...args], {}, ledger);
    expect(r.stdout.split('\n')[0]).toBe('mode: loop');
    const chats = seen.filter((s) => s.url.endsWith('/chat/completions'));
    expect(chats[0].body).toHaveProperty('tools');
  });
});
