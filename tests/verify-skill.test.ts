import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

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

  it('open on a run whose server is stopped prints one FAIL line, not a stack trace', { timeout: 20000 }, async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:9', port: 9, pid: 0, commit: '' }));
    const { code, out } = await verify(['open', 'anything', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL no instance answers at http://127.0.0.1:9');
    expect(out).not.toContain('at async');
    expect(out).not.toContain('TypeError');
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
