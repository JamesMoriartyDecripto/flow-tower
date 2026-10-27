import { execFile, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A squad.json "cli" names a script that runs on every live event, so only the runner's own checkout may use it (#324).
const SPAWN = { timeout: 60_000 };
const VERDICT = '{"verdict":"approve","findings":[]}';

// A stub OpenRouter that answers every chat request with the same verdict.
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: VERDICT }, finish_reason: 'stop' }], usage: { cost: 0.003, prompt_tokens: 100 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

// Async on purpose: the stub lives in this process, so a blocking spawn would deadlock the server.
function run(args: string[], ledger: string): Promise<{ code: number; stderr: string }> {
  const childEnv: Record<string, string> = { ...(process.env as Record<string, string>), OPENROUTER_API_KEY: 'test-key', SQUAD_API_BASE: base, SQUAD_LEDGER: ledger, FLOW_TOWER_URL: 'http://127.0.0.1:1' };
  delete childEnv.FLOW_TOWER_CLI;
  delete childEnv.SQUAD_PACE;
  return new Promise((resolve) => {
    execFile('node', args, { env: childEnv, encoding: 'utf8', timeout: 60_000 }, (err, _stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stderr });
    });
  });
}

// A temp git repo with a copy of tools/squad (the runner under test lives in repo A). The squad.json names an evil.js
// that writes a marker beside itself, so the marker shows whether that script ran.
function repo(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `squad-cli-${name}-`));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const squad = join(dir, 'tools', 'squad');
  mkdirSync(squad, { recursive: true });
  cpSync(join(process.cwd(), 'tools', 'squad'), squad, { recursive: true });
  // The copied .cli would point back at the real checkout: this runner must fall back to nothing, not to that path.
  rmSync(join(squad, '.cli'), { force: true });
  writeFileSync(join(squad, 'squad.json'), JSON.stringify({ cli: 'evil.js' }));
  writeFileSync(join(dir, 'evil.js'), "require('node:fs').writeFileSync(require('node:path').join(__dirname, 'marker'), 'ran');\n");
  return dir;
}

describe('squad.json "cli" runs only in the runner\'s own checkout', () => {
  it('a --repo that is another checkout ignores the cli and does not run it', SPAWN, async () => {
    const a = repo('runner');
    const b = repo('other');
    const task = join(b, 'task.md');
    writeFileSync(task, 'Review this diff: +const x = 1;');
    const ledger = join(b, 'ledger.jsonl');
    const r = await run([join(a, 'tools', 'squad', 'run.mjs'), '--model', 'vendor-a/model-x', '--node', 'specialists.review', '--task', task, '--role', 'reviewer', '--oneshot', '--repo', b], ledger);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('squad.json "cli" ignored');
    expect(existsSync(join(b, 'marker'))).toBe(false);
  });

  it('a --repo that is the runner\'s own checkout uses the cli', SPAWN, async () => {
    const a = repo('own');
    const task = join(a, 'task.md');
    writeFileSync(task, 'Review this diff: +const x = 1;');
    const ledger = join(a, 'ledger.jsonl');
    const r = await run([join(a, 'tools', 'squad', 'run.mjs'), '--model', 'vendor-a/model-x', '--node', 'specialists.review', '--task', task, '--role', 'reviewer', '--oneshot', '--repo', a], ledger);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain('squad.json "cli" ignored');
    expect(existsSync(join(a, 'marker'))).toBe(true);
  });
});
