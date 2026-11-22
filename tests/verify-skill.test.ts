import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Every test spawns the script; none starts a server or a browser.
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
  it('--help exits 0 and names all six commands', async () => {
    const { code, out } = await verify(['--help']);
    expect(code).toBe(0);
    for (const command of ['launch', 'doctor', 'stop', 'open', 'events', 'validate']) expect(out).toContain(command);
  });

  it('doctor on an empty run folder exits 1 and reports FAIL run.json', async () => {
    const dir = tempDir();
    const { code, out } = await verify(['doctor', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL run.json');
  });

  it('doctor refuses a run.json whose pid is 1 before any signal', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:1', port: 1, pid: 1, commit: '' }));
    const { code, out } = await verify(['doctor', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL run.json: pid 1 is not a server PID');
  });

  it('validate runs the CLI on a starter and keeps its JSON as evidence', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:1', port: 1, commit: '' }));
    const { code } = await verifyWith(['validate', 'examples/starters', '--run', dir, '--name', 'v'], 60000);
    expect(code).toBe(0);
    const ev = JSON.parse(readFileSync(join(dir, 'evidence', 'v.json'), 'utf8'));
    expect(ev.exit).toBe(0);
    expect(JSON.parse(ev.stdout).ok).toBe(true);
  }, 70000);

  it('open on a run whose server is stopped prints one FAIL line, not a stack trace', { timeout: 20000 }, async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:9', port: 9, commit: '' }));
    const { code, out } = await verify(['open', 'anything', '--run', dir]);
    expect(code).toBe(1);
    expect(out).toContain('FAIL no instance answers at http://127.0.0.1:9');
    expect(out).not.toContain('at async');
    expect(out).not.toContain('TypeError');
  });

  it('open on a server that answers 200 with a body that is not a workspace prints one FAIL line', { timeout: 20000 }, async () => {
    const server: HttpServer = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const dir = tempDir();
      writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url, port: 1, commit: '' }));
      const { code, out } = await verify(['open', 'anything', '--run', dir]);
      expect(code).toBe(1);
      expect(out).toContain('FAIL no instance answers at');
      expect(out).not.toContain('TypeError');
      expect(out).not.toContain('at async');
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

  it('validate on a broken tower exits 1 and keeps the error in its evidence', { timeout: 60000 }, async () => {
    const dir = tempDir();
    const tower = join(dir, 'broken');
    mkdirSync(tower);
    writeFileSync(join(tower, 'broken.tower.yaml'), 'name: Broken\nlayers:\n  - id: a\n    title: A\n    nodes:\n      - { id: x, type: agent, label: X }\n    edges:\n      - x -> nowhere\n');
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 't', evidence: join(dir, 'evidence'), url: 'http://127.0.0.1:1', port: 1, commit: '' }));
    const { code, out } = await verifyWith(['validate', tower, '--run', dir, '--name', 'broken'], 60000);
    expect(code).toBe(1);
    expect(out.split('\n').filter((l) => l.startsWith('FAIL validate exited'))).toHaveLength(1);
    const ev = JSON.parse(readFileSync(join(dir, 'evidence', 'broken.json'), 'utf8'));
    expect(ev.exit).toBe(1);
    expect(ev.error.startsWith('validate exited')).toBe(true);
  });
});
