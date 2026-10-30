import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Every run must leave the tower with exactly one agent.start and one terminal agent.end, the end carrying the
// outcome (ok or error), whatever the exit. The tower is a trusted recorder: a .cjs file run with node through its
// shebang, named as FLOW_TOWER_CLI, so ev.sh calls it as the flow-tower CLI. It appends each emit to a JSONL file.
// The model is a fetch the child replaces (the same pattern as squad-step-limit.test.ts), so nothing is sent.
const RUN = 'tools/squad/run.mjs';
const NODE = 'specialists.coder';
const ANSWER = '{"verdict":"approve","findings":[]}';
const FINISH = JSON.stringify({ report: 'Done.\n\nKnown gaps: none' });
const SPAWN = { timeout: 60_000 };

const RECORDER = `#!/usr/bin/env node
// Trusted test recorder: stands in for the flow-tower CLI. "emit" appends one line; SQUAD_EVENTS_DOWN makes it offline.
const { appendFileSync } = require('node:fs');
if (process.env.SQUAD_EVENTS_DOWN) process.exit(1);
const a = process.argv.slice(2);
const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
appendFileSync(process.env.SQUAD_EVENTS, JSON.stringify({ kind: val('--kind'), node: val('--node'), message: val('-m'), status: val('--status') }) + '\\n');
`;

// The fake model: the mode picks the answer. "hang" never answers, so the test can signal while the request is pending.
const FIXTURE = `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, init) => {
  appendFileSync(process.env.SQUAD_MOCK_REQUESTS, JSON.stringify({ messages: JSON.parse(init.body).messages }) + '\\n');
  const mode = process.env.SQUAD_MOCK_MODE;
  // A live timer stands in for the provider socket: without a handle Node would exit 13 (unsettled await) at once.
  if (mode === 'hang') { setInterval(() => {}, 1000); return new Promise(() => {}); }
  if (mode === 'http') return new Response(JSON.stringify({ error: { message: 'refused raw-body-secret' } }), { status: 402, headers: { 'Content-Type': 'application/json' } });
  if (mode === 'malformed') return new Response('not json {', { status: 200, headers: { 'Content-Type': 'application/json' } });
  const message = mode === 'empty' ? { role: 'assistant', content: '' } : JSON.parse(process.env.SQUAD_MOCK_REPLY);
  const finish_reason = mode === 'truncated' ? 'length' : 'stop';
  return new Response(JSON.stringify({ choices: [{ message, finish_reason }], usage: { cost: 0.001, prompt_tokens: 10 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
`;

type Result = { code: number; stdout: string; stderr: string };
type Event = { kind: string; node: string; message: string; status?: string };
type Setup = { dir: string; args: string[]; env: Record<string, string>; events: string; ledger: string; requests: string };

// Every fixture root and live child is tracked, so afterEach can stop stragglers before deleting their folder.
const roots: string[] = [];
const children = new Set<ChildProcess>();
afterEach(() => {
  for (const c of children) c.kill('SIGKILL');
  children.clear();
  for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true });
});

// A fresh folder per test: the recorder, the fake model, the ledger and a fake HOME and key. No real key or network.
function setup(role: string, mode: string, reply: unknown, flag: string): Setup {
  const dir = mkdtempSync(join(tmpdir(), 'squad-terminal-'));
  roots.push(dir);
  const task = join(dir, 'task.md');
  writeFileSync(task, 'Check the terminal events.');
  const cli = join(dir, 'recorder.cjs');
  writeFileSync(cli, RECORDER, { mode: 0o755 });
  writeFileSync(join(dir, 'mock-fetch.mjs'), FIXTURE);
  const events = join(dir, 'events.jsonl');
  const ledger = join(dir, 'ledger.jsonl');
  const requests = join(dir, 'requests.jsonl');
  const env: Record<string, string> = {
    HOME: dir,
    FLOW_TOWER_HOME: dir,
    FLOW_TOWER_CLI: cli,
    SQUAD_EVENTS: events,
    SQUAD_LEDGER: ledger,
    SQUAD_MOCK_REQUESTS: requests,
    SQUAD_MOCK_MODE: mode,
    SQUAD_MOCK_REPLY: JSON.stringify(reply),
    OPENROUTER_API_KEY: 'test-key',
  };
  const args = ['--model', 'vendor-a/model-x', '--node', NODE, '--task', task, '--role', role, flag];
  return { dir, args, env, events, ledger, requests };
}

// Spawns the runner with the fake model preloaded. The child is returned so a test can signal it.
function start(t: Setup, args: string[], extra: Record<string, string> = {}): { child: ReturnType<typeof spawn>; done: Promise<Result> } {
  // The host's pace and CLI settings are dropped: the test chooses the mode and the recorder itself.
  const { SQUAD_PACE: _pace, FLOW_TOWER_CLI: _cli, ...host } = process.env;
  const child = spawn('node', ['--import', pathToFileURL(join(t.dir, 'mock-fetch.mjs')).href, RUN, ...args], {
    env: { ...host, ...t.env, ...extra } as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  // A hung child is killed at the deadline, so one stuck run cannot hold the whole suite.
  const timer = setTimeout(() => child.kill('SIGKILL'), SPAWN.timeout);
  let stdout = '', stderr = '';
  child.stdout?.on('data', (c: Buffer) => { stdout += c; });
  child.stderr?.on('data', (c: Buffer) => { stderr += c; });
  const settle = (code: number, extra = '') => new Promise<Result>((resolve) => {
    children.delete(child);
    clearTimeout(timer);
    resolve({ code, stdout, stderr: stderr + extra });
  });
  const done = new Promise<Result>((resolve) => {
    // A spawn failure (no node binary, bad cwd) emits 'error' and may skip 'close': settle on either.
    child.on('error', (err) => { settle(-1, String(err)).then(resolve); });
    child.on('close', (code) => { settle(code ?? -1).then(resolve); });
  });
  return { child, done };
}

const run = (t: Setup, args: string[] = t.args, extra?: Record<string, string>) => start(t, args, extra).done;

// Every emitted event, in order. A run that emits nothing (an invalid argument, an offline tower) has no file.
const readEvents = (file: string): Event[] => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const lastRow = (ledger: string) => JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').at(-1) ?? '{}');

// Exactly one start, then exactly one terminal end on the same node, with the given status.
function expectOneLifecycle(events: Event[], status: 'ok' | 'error') {
  const life = events.filter((e) => e.kind.startsWith('agent.'));
  expect(life.map((e) => e.kind)).toEqual(['agent.start', 'agent.end']);
  expect(life.map((e) => e.node)).toEqual([NODE, NODE]);
  expect(life[1].status).toBe(status);
  // No raw provider body, key or prompt in any terminal message.
  for (const e of life) expect(e.message).not.toMatch(/test-key|raw-body-secret/);
}

// Polls for the marker file the fake model writes on its request, within a bounded deadline (no fixed sleep).
async function waitForFile(file: string, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (!existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`no request marker at ${file}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('a started role always gets exactly one terminal agent.end', () => {
  it('a successful loop finish: one start, one ok end, exit 0', SPAWN, async () => {
    const t = setup('coder', 'finish', { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'finish', arguments: FINISH } }] }, '--loop');
    const r = await run(t);
    expect(r.code).toBe(0);
    expectOneLifecycle(readEvents(t.events), 'ok');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'finish' });
  });

  it('a step-cap exit emits its error end once, with the ledger row and exit 1', SPAWN, async () => {
    const t = setup('coder', 'finish', { role: 'assistant', content: 'still thinking' }, '--loop');
    const r = await run(t, [...t.args, '--steps', '1']);
    expect(r.code).toBe(1);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'step-cap' });
  });

  it('a oneshot HTTP refusal ends the role with one error', SPAWN, async () => {
    const t = setup('reviewer', 'http', null, '--oneshot');
    const r = await run(t);
    expect(r.code).toBe(1);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'http-error' });
  });

  it('a loop HTTP refusal ends the role with one error', SPAWN, async () => {
    const t = setup('coder', 'http', null, '--loop');
    const r = await run(t);
    expect(r.code).toBe(1);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'http-error' });
  });

  it('a malformed JSON body crashes the run: the exit handler ends the role with one error', SPAWN, async () => {
    const t = setup('coder', 'malformed', null, '--loop');
    const r = await run(t);
    expect(r.code).not.toBe(0);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'crash' });
  });

  it('an empty oneshot answer ends the role with one error', SPAWN, async () => {
    const t = setup('reviewer', 'empty', null, '--oneshot');
    const r = await run(t);
    expect(r.code).toBe(1);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'empty-answer' });
  });

  it('a truncated oneshot answer ends the role with one error', SPAWN, async () => {
    const t = setup('reviewer', 'truncated', { role: 'assistant', content: ANSWER }, '--oneshot');
    const r = await run(t);
    expect(r.code).toBe(1);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'truncated-answer' });
  });

  it('SIGTERM while a request is pending ends the role with one error, the ledger says interrupted', SPAWN, async () => {
    const t = setup('coder', 'hang', null, '--loop');
    const { child, done } = start(t, t.args);
    await waitForFile(t.requests);
    child.kill('SIGTERM');
    const r = await done;
    expect(r.code).toBe(143);
    expectOneLifecycle(readEvents(t.events), 'error');
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'interrupted' });
  });

  it('invalid steps before the start emit no agent event at all', SPAWN, async () => {
    const t = setup('coder', 'finish', null, '--loop');
    const r = await run(t, [...t.args, '--steps', '0']);
    expect(r.code).toBe(1);
    expect(readEvents(t.events)).toEqual([]);
    expect(existsSync(t.requests)).toBe(false);
  });

  it('an offline tower does not change a successful exit: still exit 0 and the ledger finish', SPAWN, async () => {
    const t = setup('coder', 'finish', { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'finish', arguments: FINISH } }] }, '--loop');
    const r = await run(t, t.args, { SQUAD_EVENTS_DOWN: '1' });
    expect(r.code).toBe(0);
    expect(readEvents(t.events)).toEqual([]);
    expect(lastRow(t.ledger)).toMatchObject({ outcome: 'finish' });
  });
});
