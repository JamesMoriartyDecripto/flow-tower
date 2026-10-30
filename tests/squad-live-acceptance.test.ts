import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FlowEventSchema, resolveTargets } from '../src/core/events';
import { loadLibrary } from '../src/core/loader';
import { createAcceptanceFixture, toolCall, type AcceptanceFixture } from './helpers/squad-acceptance-fixture';
// @ts-expect-error plain .mjs registry, the same convention as squad-roles.test.ts
import { ROLES } from '../tools/squad/roles.mjs';

// Live delivery: the installed runner -> the installed ev.sh -> the trusted checkout CLI -> a loopback collector.
// Still a fake model and a loopback collector only: no real provider, no host parity, no cancellation (SIGTERM is
// covered by squad-terminal-events.test.ts, which uses a recorder rather than the real CLI).

const CLI = resolve('bin', 'flow-tower.js');
const USER = 'acceptance-user';
const MACHINE = 'acceptance-machine';
const TASK = '# Live delivery\n\nReview and document the sum helper. You may write only docs/.\n';
const ANSWER = JSON.stringify({ verdict: 'approve', findings: [] });
// Every registered role, in registry order; verdict roles answer once in oneshot mode, the rest finish through a tool call.
const ROLE_NAMES = Object.keys(ROLES) as string[];

type Captured = { body: unknown };

let fx: AcceptanceFixture;
let task: string;
let collector: Server;
let collectorUrl: string;
const captured: Captured[] = [];

/** Reads each POST body (a JSON array of events) and answers 204 with an empty body. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => ok(raw));
  });
}

const liveEnv = (): Record<string, string> => ({
  FLOW_TOWER_CLI: CLI,
  FLOW_TOWER_URL: collectorUrl,
  FLOW_TOWER_USER: USER,
  FLOW_TOWER_MACHINE: MACHINE,
});

/** Flattens every captured POST into validated events, in arrival order. */
function events() {
  return captured.flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])).map((b) => FlowEventSchema.parse(b));
}

function ledgerRows(): { role?: string; outcome?: string }[] {
  const file = fx.env().SQUAD_LEDGER;
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
}

beforeAll(async () => {
  collector = createServer(async (req, res) => {
    const raw = await readBody(req);
    if (req.method === 'POST' && req.url?.startsWith('/api/events')) captured.push({ body: JSON.parse(raw) });
    res.writeHead(204);
    res.end();
  });
  await new Promise<void>((ok) => collector.listen(0, '127.0.0.1', ok));
  collectorUrl = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;
  fx = await createAcceptanceFixture();
  task = join(dirname(fx.dir), 'live-task.md');
  writeFileSync(task, TASK);
  // doc-writer needs its --write folder to exist at run time; the folder is created in the fixture, never committed.
  mkdirSync(join(fx.dir, 'docs'));
}, 120_000);

afterAll(async () => {
  await fx?.close();
  await new Promise<void>((ok) => collector.close(() => ok()));
});

describe('live delivery: installed runner to the trusted CLI to a loopback collector', () => {
  it('the installed root and coder/researcher nested towers validate with 0 errors and 0 warnings', async () => {
    const lib = await loadLibrary([join(fx.dir, 'tools', 'squad')]);
    const ids = Object.keys(lib.workspace.towers);
    expect(ids.some((id) => id.includes('coder'))).toBe(true);
    expect(ids.some((id) => id.includes('researcher'))).toBe(true);
    const issues = Object.values(lib.workspace.towers).flatMap((t) => t.issues);
    expect(issues.filter((i) => i.level === 'error').map((i) => i.message)).toEqual([]);
    expect(issues.filter((i) => i.level === 'warning').map((i) => i.message)).toEqual([]);
  });

  it('every registered role delivers exactly one start and one ok end through the installed CLI path', async () => {
    const config = JSON.parse(readFileSync(join(fx.dir, 'tools', 'squad', 'squad.json'), 'utf8'));
    const lib = await loadLibrary([join(fx.dir, 'tools', 'squad')]);
    const rootId = Object.keys(lib.workspace.towers).find((id) => !id.includes('coder') && !id.includes('researcher'))!;
    const env = { ...liveEnv() };
    for (const role of ROLE_NAMES) {
      const verdict = ROLES[role].verdict;
      captured.length = 0;
      fx.setReplies(verdict ? [{ choices: [{ message: { role: 'assistant', content: ANSWER }, finish_reason: 'stop' }], usage: { cost: 0, prompt_tokens: 1 } }] : [toolCall(`f-${role}`, 'finish', { report: 'Done.\nKnown gaps: none' })]);
      const extra = role === 'doc-writer' ? ['--write', 'docs'] : [];
      const mode = verdict ? '--oneshot' : '--loop';
      const r = await fx.runner(['--role', role, '--model', 'fake/model', '--issue', '335', '--steps', '4', '--task', task, mode, ...extra], { env });
      expect(r.code, `${role}: ${r.stderr || r.stdout}`).toBe(0);

      const ev = events();
      const life = ev.filter((e) => e.kind.startsWith('agent.'));
      expect(life.map((e) => e.kind), role).toEqual(['agent.start', 'agent.end']);
      expect(life[1].status, role).toBe('ok');
      expect(life.map((e) => e.node), role).toEqual([ROLES[role].node, ROLES[role].node]);
      expect(life[0].source, role).toBe(config.source);
      expect(life[0].tower, role).toBe(config.tower);
      for (const e of life) {
        // The event must route to the actual root tower's canonical node, not merely carry the matching string.
        expect(resolveTargets(lib.workspace, e), role).toContain(`${rootId}#${ROLES[role].node}`);
      }
      expect(ledgerRows().at(-1), role).toMatchObject({ role, outcome: 'finish' });
    }
  }, 240_000);

  it('a reviewer with an empty provider script exits nonzero, ends once with an error, and records http-error', async () => {
    fx.setReplies([]);
    captured.length = 0;
    const r = await fx.runner(['--role', 'reviewer', '--model', 'fake/model', '--issue', '335', '--steps', '4', '--task', task, '--oneshot'], { env: liveEnv() });
    expect(r.code).not.toBe(0);
    const life = events().filter((e) => e.kind.startsWith('agent.'));
    expect(life.map((e) => e.kind)).toEqual(['agent.start', 'agent.end']);
    expect(life[1].status).toBe('error');
    expect(life[1].node).toBe(ROLES.reviewer.node);
    // No raw key or provider error text may reach a terminal message.
    for (const e of life) expect(e.message).not.toMatch(/sk-or-|fake provider has no scripted reply/);
    expect(ledgerRows().at(-1)).toMatchObject({ role: 'reviewer', outcome: 'http-error' });
  });
});
