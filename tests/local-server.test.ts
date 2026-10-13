import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { clearLocalServer, localServerFile, localServerUrl, writeLocalServer } from '../bin/local-server.js';
import { cleanEnv } from './fixtures/clean-env';

/**
 * The local server record (#187): `serve` writes its url into the user folder, `emit` and `simulate` read it.
 * Temp folders only, and loopback servers on port 0: nothing touches the real user folder or port 5317.
 */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');
const homes: string[] = [];
const newHome = () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-local-server-'));
  homes.push(dir);
  return dir;
};
afterAll(() => homes.forEach((d) => rmSync(d, { recursive: true, force: true })));

const servers: Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

/** A pid that is certainly dead: a child that has exited and been reaped. */
function deadPid() {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, ['-e', '']);
    child.on('exit', () => resolve(child.pid as number));
  });
}

describe('local server record (#187)', () => {
  it('gives back the url it was written with while its pid is alive', () => {
    const home = newHome();
    writeLocalServer({ home, url: 'http://127.0.0.1:5434', pid: process.pid });
    expect(localServerUrl({ env: {}, home })).toBe('http://127.0.0.1:5434');
    expect(JSON.parse(readFileSync(localServerFile(home), 'utf8'))).toMatchObject({ url: 'http://127.0.0.1:5434', pid: process.pid });
  });

  it('reads undefined when the recorded pid is dead', async () => {
    const home = newHome();
    const pid = await deadPid();
    writeLocalServer({ home, url: 'http://127.0.0.1:5434', pid });
    expect(localServerUrl({ env: {}, home })).toBeUndefined();
  });

  it('reads undefined when there is no file or it is not JSON', () => {
    const home = newHome();
    expect(localServerUrl({ env: {}, home })).toBeUndefined();
    writeFileSync(localServerFile(home), '{ broken');
    expect(localServerUrl({ env: {}, home })).toBeUndefined();
  });

  it('clearLocalServer leaves a record that another pid wrote', async () => {
    const home = newHome();
    writeLocalServer({ home, url: 'http://127.0.0.1:5434', pid: process.pid });
    clearLocalServer({ home, pid: await deadPid() });
    expect(existsSync(localServerFile(home))).toBe(true);
    clearLocalServer({ home, pid: process.pid });
    expect(existsSync(localServerFile(home))).toBe(false);
  });

  it('emit posts to the recorded local server, with no config token attached', { timeout: 20_000 }, async () => {
    const home = newHome();
    writeFileSync(join(home, 'config.json'), JSON.stringify({ role: 'satellite', url: 'https://hub.example.invalid', token: 'ft_test' }));
    const seen: { path?: string; headers: IncomingHttpHeaders }[] = [];
    const server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        seen.push({ path: req.url, headers: req.headers });
        res.statusCode = 204;
        res.end();
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    writeLocalServer({ home, url: `http://127.0.0.1:${port}`, pid: process.pid });

    const status = await new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, [CLI, 'emit', '--kind', 'log', '-m', 'hi'], {
        timeout: 15_000,
        env: cleanEnv({ FLOW_TOWER_HOME: home }),
      });
      child.on('close', resolve);
    });

    expect(status).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toMatch(/^\/api\/events/);
    expect(seen[0].headers['x-flow-tower-token']).toBeUndefined();
  });
});
