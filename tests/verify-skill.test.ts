import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Every test spawns the script; none starts a Flow Tower server or a browser. Some start a stub HTTP or TCP server on 127.0.0.1,
// and some use the test process's own PID as a live process that stop must refuse to signal.
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
  it('--help exits 0 and names the three commands, not events', async () => {
    const { code, out } = await verify(['--help']);
    expect(code).toBe(0);
    for (const command of ['launch', 'doctor', 'stop']) expect(out).toContain(command);
    expect(out).not.toContain('events');
  });

  it('doctor on an empty run folder exits 1 and reports FAIL run.json', async () => {
    const dir = tempDir();
    const { code, out } = await verify(['doctor', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL run.json');
  });

  it('doctor refuses a run.json whose pid is 1 before any signal', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:1', pid: 1, commit: '' }));
    const { code, out } = await verify(['doctor', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL run.json: pid 1 is not a server PID');
  });

  it('doctor on a server that answers 200 with a body that is not a workspace exits 1 and reports FAIL workspace', { timeout: 20000 }, async () => {
    const server: HttpServer = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const dir = tempDir();
      writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url, commit: '' }));
      const { code, out } = await verify(['doctor', '--run', dir]);
      expect(code).toBe(1);
      expect(out).toContain('FAIL workspace');
      expect(out).not.toContain('TypeError');
    } finally {
      server.close();
    }
  });

  it('doctor and stop without --run exit 1 and name the required flag', { timeout: 20000 }, async () => {
    for (const command of ['doctor', 'stop']) {
      const { code, out } = await verifyWith([command], 20000);
      expect(code).toBe(1);
      expect(out).toContain('--run <dir> is required');
    }
  });

  it('doctor --project confirms a served project by prefix and fails on a missing one', { timeout: 20000 }, async () => {
    const server: HttpServer = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"projects":["a/a.tower.yaml","b/b.tower.yaml"],"towers":{}}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const dir = tempDir();
      writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url, commit: '' }));
      const found = await verifyWith(['doctor', '--run', dir, '--project', 'b'], 20000);
      expect(found.out).toContain('ok   project: b/b.tower.yaml');
      const missing = await verifyWith(['doctor', '--run', dir, '--project', 'zzz'], 20000);
      expect(missing.code).toBe(1);
      expect(missing.out).toContain('FAIL project');
    } finally {
      server.close();
    }
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

  it('launch refuses a port that is not a number and creates nothing', async () => {
    const base = tempDir();
    const { code, out } = await verify(['launch', '--port', 'abc', '--base', base]);
    expect(code).toBe(2);
    expect(out).toContain('--port needs a number');
    expect(readdirSync(base)).toEqual([]);
  });

  it('stop refuses a live PID that is not this run server and leaves the home in place', { timeout: 20000 }, async () => {
    const dir = join(tempDir(), 'r1');
    mkdirSync(join(dir, 'home'), { recursive: true });
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r1', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:5399', port: 5399, pid: process.pid, commit: '' }));
    const { code, out } = await verify(['stop', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain("is not this run's server");
    expect(existsSync(join(dir, 'home'))).toBe(true);
    expect(() => process.kill(process.pid, 0)).not.toThrow();
  });

  it('stop refuses a run.json whose port is a pattern and signals nothing', { timeout: 20000 }, async () => {
    const dir = join(tempDir(), 'r2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r2', pid: process.pid, port: '.*', url: 'http://127.0.0.1:5399' }));
    const { code, out } = await verify(['stop', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL run.json: port');
    expect(() => process.kill(process.pid, 0)).not.toThrow();
  });

  it('stop removes the Vite cache of the run port from the checkout', { timeout: 20000 }, async () => {
    const dir = join(tempDir(), 'r3');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r3', port: 5398, url: 'http://127.0.0.1:5398' }));
    const cache = join(import.meta.dirname, '..', 'node_modules', '.vite', 'port-5398');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, 'deps.json'), '{}');
    try {
      const { code, out } = await verify(['stop', '--run', dir]);
      expect(code).toBe(0);
      expect(out).toContain('removed the Vite cache of port 5398');
      expect(existsSync(cache)).toBe(false);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

});
