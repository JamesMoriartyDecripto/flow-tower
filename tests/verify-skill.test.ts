import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without declarations
import { parseArgs, planRun } from '../.claude/skills/verify-flow-tower/scripts/verify.mjs';

/**
 * verify.mjs (#448). Only the pure helpers and the paths that never start a server are exercised here:
 * no real Flow Tower instance is launched by these tests.
 */
const SCRIPT = join(import.meta.dirname, '..', '.claude', 'skills', 'verify-flow-tower', 'scripts', 'verify.mjs');
const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-verify-test-'));
  temps.push(dir);
  return dir;
}

/** Runs the script and resolves with its exit code and output; a spawn that hangs is killed at 20 s. */
function verify(args: string[]) {
  return verifyWith(args, 20000);
}

function verifyWith(args: string[], timeout: number) {
  return new Promise<{ code: number; out: string }>((done) => {
    execFile(process.execPath, [SCRIPT, ...args], { timeout }, (err, stdout, stderr) => {
      const code = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
      done({ code, out: `${stdout}${stderr}` });
    });
  });
}

describe('planRun', () => {
  it('puts the run folder under base and puts the port in the runId', () => {
    const base = join(tmpdir(), 'base-x');
    const plan = planRun({ base, port: 5327, now: new Date('2026-01-02T03:04:05.000Z') });
    expect(plan.runId).toContain('5327');
    expect(plan.home.startsWith(join(base, plan.runId))).toBe(true);
    expect(plan.evidence.startsWith(join(base, plan.runId))).toBe(true);
    expect(plan.url).toBe('http://127.0.0.1:5327');
  });
});

describe('parseArgs', () => {
  it('reads the command and flags', () => {
    const args = parseArgs(['launch', '--port', '5400', '--base', '/tmp/b']);
    expect(args.command).toBe('launch');
    expect(args.port).toBe(5400);
    expect(args.base).toBe('/tmp/b');
  });
});

describe('verify.mjs CLI', () => {
  it('--help exits 0 and names launch, doctor and stop', async () => {
    const { code, out } = await verify(['--help']);
    expect(code).toBe(0);
    expect(out).toContain('launch');
    expect(out).toContain('doctor');
    expect(out).toContain('stop');
  });

  it('doctor on an empty run folder exits 1 and reports FAIL run.json', async () => {
    const dir = tempDir();
    const { code, out } = await verify(['doctor', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL run.json');
  });

  it('validate runs the CLI on a starter and keeps its JSON as evidence', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:1', port: 1, pid: 0, commit: '' }));
    const { code } = await verifyWith(['validate', 'examples/starters', '--run', dir, '--name', 'v'], 60000);
    expect(code).toBe(0);
    const ev = JSON.parse(readFileSync(join(dir, 'evidence', 'v.json'), 'utf8'));
    expect(ev.exit).toBe(0);
    expect(JSON.parse(ev.stdout).ok).toBe(true);
  }, 70000);

  it('--help names open, events and validate', async () => {
    const { code, out } = await verify(['--help']);
    expect(code).toBe(0);
    expect(out).toContain('open');
    expect(out).toContain('events');
    expect(out).toContain('validate');
  });

  it('launch refuses a port that is already taken and creates no run folder', async () => {
    const server: Server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const port = (server.address() as AddressInfo).port;
      const base = tempDir();
      const { code, out } = await verify(['launch', '--port', String(port), '--base', base]);
      expect(code).toBe(1);
      expect(out).toContain('is in use');
      expect(existsSync(join(base, 'current'))).toBe(false);
    } finally {
      server.close();
    }
  });
});
