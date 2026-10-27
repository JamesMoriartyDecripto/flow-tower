import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN = 'tools/squad/run.mjs';
const SPAWN = { timeout: 60_000 };
const VERDICT = '{"verdict":"approve","findings":[]}';

// A stub OpenRouter that answers chat requests in order from a queue set per test. Each reply is one assistant
// message: plain content, or a finish tool call. Every request body is kept, so a test can read what the model saw.
type Message = { content: string | null; tool_calls?: unknown[] };
let replies: Message[] = [];
let seen: { messages: { role: string; content: string }[] }[] = [];
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c; });
    req.on('end', () => {
      const send = (obj: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url?.endsWith('/chat/completions')) {
        seen.push(JSON.parse(raw));
        const message = replies.shift() ?? { content: 'out of replies' };
        return send({ choices: [{ message, finish_reason: 'stop' }], usage: { cost: 0.003, prompt_tokens: 100 } });
      }
      send({ id: 'none', status: 'completed' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

type Result = { code: number; stdout: string; stderr: string };

// Async on purpose: the stub lives in this process, so a blocking spawn would deadlock the server.
function run(args: string[], ledger: string): Promise<Result> {
  const childEnv: Record<string, string> = { ...(process.env as Record<string, string>), OPENROUTER_API_KEY: 'test-key', SQUAD_API_BASE: base, SQUAD_LEDGER: ledger };
  delete childEnv.SQUAD_PACE;
  return new Promise((resolve) => {
    execFile('node', [RUN, ...args], { env: childEnv, encoding: 'utf8', timeout: 60_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

// A fresh temp git repo per test, so the run never reads or writes the real checkout.
function setup(role: string) {
  const dir = mkdtempSync(join(tmpdir(), 'squad-verdict-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const task = join(dir, 'task.md');
  writeFileSync(task, 'Review this diff: +const x = 1;');
  const ledger = join(dir, 'ledger.jsonl');
  const args = ['--model', 'vendor-a/model-x', '--node', 'specialists.review', '--task', task, '--issue', '322', '--role', role, '--repo', dir];
  return { ledger, args };
}

const finishCall = (report: string): Message => ({
  content: null,
  tool_calls: [{ id: `call-${report.length}`, type: 'function', function: { name: 'finish', arguments: JSON.stringify({ report }) } }],
});
const lastRow = (ledger: string) => JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');

describe('a reviewer or security answer without a JSON verdict fails the run', () => {
  it('oneshot with prose exits 1, prints no JSON verdict and records no-verdict', SPAWN, async () => {
    const { ledger, args } = setup('reviewer');
    replies = [{ content: 'looks fine to me' }];
    const r = await run([...args, '--oneshot'], ledger);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('no JSON verdict');
    expect(lastRow(ledger)).toMatchObject({ outcome: 'no-verdict' });
  });

  it('oneshot with a JSON verdict exits 0', SPAWN, async () => {
    const { ledger, args } = setup('security');
    replies = [{ content: VERDICT }];
    const r = await run([...args, '--oneshot'], ledger);
    expect(r.code).toBe(0);
    expect(lastRow(ledger)).toMatchObject({ outcome: 'finish' });
  });

  it('loop: a prose finish report gets one re-ask, and the JSON report that follows passes', SPAWN, async () => {
    const { ledger, args } = setup('reviewer');
    seen = [];
    replies = [finishCall('looks fine to me'), finishCall(VERDICT)];
    const r = await run([...args, '--loop'], ledger);
    expect(r.code).toBe(0);
    const asked = seen.some((b) => b.messages.some((m) => m.role === 'user' && m.content.includes('not the JSON verdict')));
    expect(asked).toBe(true);
    expect(lastRow(ledger)).toMatchObject({ outcome: 'finish' });
  });

  it('loop: two prose finish reports exit 1 with no JSON verdict after a second request', SPAWN, async () => {
    const { ledger, args } = setup('security');
    replies = [finishCall('looks fine to me'), finishCall('still fine')];
    const r = await run([...args, '--loop'], ledger);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('no JSON verdict after a second request');
    expect(lastRow(ledger)).toMatchObject({ outcome: 'no-verdict' });
  });

  it('the coder keeps its prose report: a finish with no verdict exits 0', SPAWN, async () => {
    const { ledger, args } = setup('coder');
    replies = [finishCall('Changed the parser. Known gaps: none')];
    const r = await run([...args, '--loop'], ledger);
    expect(r.code).toBe(0);
    expect(lastRow(ledger)).toMatchObject({ outcome: 'finish' });
  });
});
