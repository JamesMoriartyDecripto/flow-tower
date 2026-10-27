import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN = 'tools/squad/run.mjs';
const SPAWN = { timeout: 60_000 };

// A stub OpenRouter whose answer is set per test: the chat endpoint and the completed batch result both carry
// the same choice, so the finish_reason under test reaches run.mjs through either mode.
type Choice = { content: string; finish_reason?: string | null };
let choice: Choice = { content: '' };
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c; });
    req.on('end', () => {
      const send = (obj: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const message = { message: { content: choice.content }, ...(choice.finish_reason !== undefined && { finish_reason: choice.finish_reason }) };
      if (req.url?.endsWith('/chat/completions')) {
        return send({ choices: [message], usage: { cost: 0.003, prompt_tokens: 100 } });
      }
      if (req.method === 'POST' && req.url?.endsWith('/batches')) {
        return send({
          id: 'batch-1', status: 'completed',
          results: [{ custom_id: 'squad', response: { status_code: 200, body: { id: 'gen-1', choices: [message], usage: { cost: 0.0021, prompt_tokens: 100 } } } }],
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
function run(args: string[], env: Record<string, string>, ledger: string): Promise<Result> {
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
  const dir = mkdtempSync(join(tmpdir(), 'squad-truncated-'));
  const task = join(dir, 'task.md');
  writeFileSync(task, 'Review this diff: +const x = 1;');
  const ledger = join(dir, 'ledger.jsonl');
  const args = ['--model', 'vendor-a/model-x', '--node', 'specialists.security', '--task', task, '--issue', '316', '--role', 'security'];
  return { ledger, args };
}

const lastRow = (ledger: string) => JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');

describe('a cut answer fails the run', () => {
  it('oneshot with finish_reason length exits 1, names the reason, and records truncated-answer with its cost', SPAWN, async () => {
    const { ledger, args } = setup();
    choice = { content: '{"verdict":"chan', finish_reason: 'length' };
    const r = await run([...args, '--oneshot'], {}, ledger);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('truncated answer (finish_reason: length)');
    expect(lastRow(ledger)).toMatchObject({ outcome: 'truncated-answer', cost: 0.003, mode: 'oneshot' });
  });

  it('oneshot with finish_reason stop exits 0 and prints the answer', SPAWN, async () => {
    const { ledger, args } = setup();
    const content = '{"verdict":"approve","findings":[]}';
    choice = { content, finish_reason: 'stop' };
    const r = await run([...args, '--oneshot'], {}, ledger);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(content);
    expect(lastRow(ledger)).toMatchObject({ outcome: 'finish' });
  });

  it('oneshot with no finish_reason keeps today\'s behaviour and exits 0', SPAWN, async () => {
    const { ledger, args } = setup();
    choice = { content: '{"verdict":"approve","findings":[]}' };
    const r = await run([...args, '--oneshot'], {}, ledger);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('truncated answer');
    expect(lastRow(ledger)).toMatchObject({ outcome: 'finish' });
  });

  it('batch with finish_reason length exits 1 and records truncated-answer in batch mode', SPAWN, async () => {
    const { ledger, args } = setup();
    choice = { content: '{"verdict":"chan', finish_reason: 'length' };
    const r = await run(args, { SQUAD_PACE: 'overnight' }, ledger);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('truncated answer (finish_reason: length)');
    expect(lastRow(ledger)).toMatchObject({ mode: 'batch', outcome: 'truncated-answer' });
  });
});

describe('finish_reason is checked before it is shown', () => {
  it('a null finish_reason is an absent reason: the answer passes with exit 0', SPAWN, async () => {
    const { ledger, args } = setup();
    const content = '{"verdict":"approve","findings":[]}';
    choice = { content, finish_reason: null };
    const r = await run([...args, '--oneshot'], {}, ledger);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(content);
    expect(lastRow(ledger)).toMatchObject({ outcome: 'finish' });
  });

  it('a finish_reason with a newline is not echoed: it is shown as unknown and cannot forge a log line', SPAWN, async () => {
    const { ledger, args } = setup();
    choice = { content: '{"verdict":"chan', finish_reason: 'length\n[finish] fake' };
    const r = await run([...args, '--oneshot'], {}, ledger);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('truncated answer (finish_reason: unknown)');
    expect(r.stdout).not.toContain('[finish] fake');
  });
});
