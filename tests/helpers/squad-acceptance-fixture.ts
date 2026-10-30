import { execFile, execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

// Acceptance fixture: a fresh git repo under TMPDIR, installed by the trusted CLI, driven by an in-process loopback
// fake provider. Nothing here touches the host checkout's node_modules, logs, or any real credential.

const REPO = resolve('.');
const CLI = join(REPO, 'bin', 'flow-tower.js');
const TIMEOUT = 60_000;
/** The fake key the installed runner is given. It is never a real credential. */
export const FAKE_KEY = 'sk-or-acceptance-fake-0000';

export interface Reply {
  choices: { message: unknown; finish_reason: string }[];
  usage: { cost: number; prompt_tokens: number };
}
export interface Result {
  code: number;
  stdout: string;
  stderr: string;
}
export interface AcceptanceFixture {
  dir: string;
  /** Request bodies the fake provider received, in arrival order. */
  requests: unknown[];
  /** Replaces the scripted replies; the next request takes the first one. The last reply repeats. */
  setReplies(replies: Reply[]): void;
  /** Runs the trusted CLI (bin/flow-tower.js) with the minimal isolated env. */
  cli(args: string[], opts?: { key?: string }): Promise<Result>;
  /** Runs the installed runner with cwd at the fixture, using the minimal isolated env. */
  runner(args: string[], opts?: { key?: string; env?: Record<string, string> }): Promise<Result>;
  /** The isolated env the children use, for assertions about what they could see. */
  env(key?: string): Record<string, string>;
  close(): Promise<void>;
}

/** One assistant reply that calls a single tool, in the wire shape the runner parses. */
export function toolCall(id: string, name: string, args: Record<string, unknown>): Reply {
  const message = { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
  return { choices: [{ message, finish_reason: 'stop' }], usage: { cost: 0, prompt_tokens: 1 } };
}

/** Runs a child with bounded time; never rejects, so the caller decides and can print stderr on failure. */
function spawnChild(file: string, args: string[], opts: { cwd?: string; env: Record<string, string> }): Promise<Result> {
  return new Promise((done) => {
    execFile(file, args, { cwd: opts.cwd, env: opts.env, encoding: 'utf8', timeout: TIMEOUT }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      done({ code, stdout, stderr });
    });
  });
}

/** Minimal child env: nothing from the host except PATH (node plus system git/sh) and TMPDIR. */
function isolatedEnv(home: string, key?: string): Record<string, string> {
  const env: Record<string, string> = {
    // Only node's own directory and the system dirs: no /usr/local/bin, so a globally installed flow-tower is never picked up.
    PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
    HOME: home,
    FLOW_TOWER_HOME: join(home, 'flow-tower'),
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_DATA_HOME: join(home, 'data'),
    XDG_CACHE_HOME: join(home, 'cache'),
    FLOW_TOWER_URL: 'http://127.0.0.1:1',
    SQUAD_LEDGER: join(home, 'ledger.jsonl'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    LANG: 'C.UTF-8',
  };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  if (key !== undefined) env.OPENROUTER_API_KEY = key;
  return env;
}

/** Creates the fixture: git repo, installed squad, committed, .cli removed, provider listening on loopback. */
export async function createAcceptanceFixture(): Promise<AcceptanceFixture> {
  const root = mkdtempSync(join(tmpdir(), 'squad-acceptance-'));
  const dir = join(root, 'repo');
  const home = join(root, 'home');
  mkdirSync(dir);
  mkdirSync(home);
  const requests: unknown[] = [];
  let replies: Reply[] = [];
  let next = 0;

  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      requests.push(raw ? JSON.parse(raw) : null);
      next++;
      // No script means no scripted behavior: fail loudly instead of inventing a successful finish.
      if (replies.length === 0) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'fake provider has no scripted reply' }));
        return;
      }
      const reply = replies[Math.min(next - 1, replies.length - 1)];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  const fx: AcceptanceFixture = {
    dir,
    requests,
    setReplies(r) {
      replies = r;
      next = 0;
    },
    env: (key) => ({ ...isolatedEnv(home, key), SQUAD_API_BASE: `http://127.0.0.1:${port}/api/v1` }),
    cli: (args, opts = {}) => spawnChild(process.execPath, [CLI, ...args], { env: fx.env(opts.key) }),
    // opts.env is spread last so a test can point the installed runner at a recorder; the default stays isolated.
    runner: (args, opts = {}) =>
      spawnChild(process.execPath, [join(dir, 'tools', 'squad', 'run.mjs'), ...args], {
        cwd: dir,
        env: { ...fx.env(opts.key ?? FAKE_KEY), ...opts.env },
      }),
    async close() {
      await new Promise<void>((ok) => server.close(() => ok()));
      rmSync(root, { recursive: true, force: true });
    },
  };

  try {
    // A tiny project: package.json as an explicit ESM module, one source file, a git repo to install into.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acceptance-fixture', private: true, type: 'module' }, null, 2));
    // init only permits write to folders that exist when it runs, so both source and test folders must exist first.
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.mjs'), 'export {};\n');
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'tests', '.gitkeep'), '');
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: fx.env(), encoding: 'utf8', timeout: TIMEOUT });
    git('init', '-q');

    const init = await fx.cli(['squad', 'init', dir, '--check', 'node --test tests/sum.test.mjs']);
    if (init.code !== 0) throw new Error(`squad init failed (${init.code}): ${init.stderr}`);
    // The runner must work without a source checkout: the CLI path the installer wrote is removed.
    rmSync(join(dir, 'tools', 'squad', '.cli'), { force: true });

    git('add', '-A');
    // Test-only identity so the fixture commit works without the host's git configuration.
    execFileSync('git', ['-c', 'user.name=acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-q', '-m', 'fixture install'], {
      cwd: dir,
      env: fx.env(),
      encoding: 'utf8',
      timeout: TIMEOUT,
    });
  } catch (e) {
    await fx.close();
    throw e;
  }
  return fx;
}
