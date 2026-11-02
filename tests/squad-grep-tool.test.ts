import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The runner talks to a fetch the fixture replaces (no socket is opened): each chat request takes the next scripted
// reply, and every request body is logged so the test can read the messages the model was sent.
const RUN = 'tools/squad/run.mjs';
const FIXTURE = `
import { readFileSync, appendFileSync } from 'node:fs';
const replies = JSON.parse(readFileSync(process.env.SQUAD_MOCK_REPLIES, 'utf8'));
let i = 0;
globalThis.fetch = async (url, init) => {
  appendFileSync(process.env.SQUAD_MOCK_REQUESTS, JSON.stringify({ messages: JSON.parse(init.body).messages }) + '\\n');
  const message = replies[Math.min(i, replies.length - 1)];
  i++;
  return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { cost: 0.001, prompt_tokens: 10 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
`;

type Message = { role: string; content: string | null; tool_call_id?: string; tool_calls?: { id: string }[] };
type Result = { code: number; stdout: string; stderr: string };

const GREP = (id: string, pattern: string, path: string) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'grep', arguments: JSON.stringify({ pattern, path }) } }] });
const FINISH = (id: string, report: string) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'finish', arguments: JSON.stringify({ report }) } }] });

// Async on purpose: the fixture lives in the child, the spawn itself must not block the test runner.
function run(args: string[], env: Record<string, string>, dir: string): Promise<Result> {
  const fixture = join(dir, 'mock-fetch.mjs');
  writeFileSync(fixture, FIXTURE);
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    FLOW_TOWER_HOME: dir,
    FLOW_TOWER_URL: 'http://127.0.0.1:1',
    SQUAD_LEDGER: join(dir, 'ledger.jsonl'),
    SQUAD_MOCK_REQUESTS: join(dir, 'requests.jsonl'),
    SQUAD_MOCK_REPLIES: join(dir, 'replies.json'),
    ...env,
  };
  childEnv.OPENROUTER_API_KEY = 'test-key';
  delete childEnv.FLOW_TOWER_CLI;
  delete childEnv.SQUAD_PACE;
  return new Promise((resolve) => {
    execFile('node', ['--import', pathToFileURL(fixture).href, RUN, ...args], { env: childEnv, encoding: 'utf8', timeout: 60_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

function setup(replies: unknown[], role = 'reviewer') {
  const dir = mkdtempSync(join(tmpdir(), 'squad-grep-tool-'));
  const task = join(dir, 'task.md');
  writeFileSync(task, 'Review the squad grep tool.');
  writeFileSync(join(dir, 'replies.json'), JSON.stringify(replies));
  const args = ['--model', 'vendor-a/model-x', '--node', 'specialists.reviewer', '--task', task, '--role', role, '--loop'];
  return { dir, args, requests: join(dir, 'requests.jsonl') };
}

// The messages of the request made after the first tool round (the second model call).
const secondRequest = (file: string): Message[] => JSON.parse(readFileSync(file, 'utf8').trim().split('\n')[1]).messages;
const toolContent = (messages: Message[]): string => messages.find((m) => m.role === 'tool')?.content ?? '';

describe('squad grep tool', () => {
  it('passes a dash-leading pattern as a pattern, not a git option', { timeout: 60_000 }, async () => {
    const { dir, args, requests } = setup([
      GREP('g1', '--pattern', 'tools/squad'),
      FINISH('f1', JSON.stringify({ verdict: 'approve', findings: [] })),
    ]);
    await run(args, {}, dir);
    const content = toolContent(secondRequest(requests));
    expect(content).toContain('tools/squad/');
    expect(content).not.toContain('usage:');
  });

  it('reports an invalid regex as a grep failure, not as no match', { timeout: 60_000 }, async () => {
    const { dir, args, requests } = setup([
      GREP('g1', '(', 'tools/squad'),
      FINISH('f1', JSON.stringify({ verdict: 'approve', findings: [] })),
    ]);
    await run(args, {}, dir);
    expect(toolContent(secondRequest(requests))).toMatch(/^grep failed: /);
  });

  it('gives the reason when a path is refused before git runs', { timeout: 60_000 }, async () => {
    const { dir, args, requests } = setup([
      GREP('g1', 'x', '../outside'),
      FINISH('f1', JSON.stringify({ verdict: 'approve', findings: [] })),
    ]);
    await run(args, {}, dir);
    expect(toolContent(secondRequest(requests))).toMatch(/^grep failed: \S/);
  });
});

const RUN_DIFF = (id: string) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'run', arguments: JSON.stringify({ command: 'diff' }) } }] });

describe('squad diff tool', () => {
  it('starts the diff with the commit list of the base..HEAD range', { timeout: 60_000 }, async () => {
    const { dir, args, requests } = setup([
      RUN_DIFF('d1'),
      FINISH('f1', JSON.stringify({ verdict: 'approve', findings: [] })),
    ]);
    const repo = join(dir, 'repo');
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' });
    mkdirSync(repo);
    git('init', '-q');
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    git('add', '.');
    git('commit', '-q', '-m', 'first step');
    writeFileSync(join(repo, 'a.txt'), 'b\n');
    git('commit', '-q', '-am', 'second step');
    await run([...args, '--repo', repo, '--base', 'HEAD~1'], {}, dir);
    expect(toolContent(secondRequest(requests))).toMatch(/^[0-9a-f]+ second step\n/);
  });

  it('refuses a --base that starts with a dash, before any model call', { timeout: 60_000 }, async () => {
    const { dir, args, requests } = setup([FINISH('f1', JSON.stringify({ verdict: 'approve', findings: [] }))]);
    const result = await run([...args, '--base', '-x'], {}, dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--base must be a revision, not an option');
    expect(existsSync(requests)).toBe(false);
  });
});
