import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanEnv } from './fixtures/clean-env';

/**
 * `flow-tower hooks` (#189). Every spawned CLI gets a temp HOME and FLOW_TOWER_HOME, so nothing touches the
 * real user folder. Ports are fixed numbers that no server listens on: no server is started here.
 */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');
const root = mkdtempSync(join(tmpdir(), 'flow-tower-hooks-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const TIMEOUT = { timeout: 30_000 };

let counter = 0;
/** A fresh home with an empty user folder and a cwd for the project level. */
function sandbox(): { home: string; cwd: string } {
  const dir = join(root, `case-${counter++}`);
  const home = join(dir, 'home');
  const cwd = join(dir, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return { home, cwd };
}

function hooks(args: string[], box: { home: string; cwd: string }) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [CLI, 'hooks', ...args], {
      cwd: box.cwd,
      // The timeout kills a stuck child, so the close event always fires.
      timeout: 20_000,
      env: cleanEnv({ HOME: box.home, FLOW_TOWER_HOME: join(box.home, '.config', 'flow-tower') }),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const settingsOf = (home: string) => join(home, '.claude', 'settings.json');

/** Every command-hook and http-hook URL in a settings file, flattened. */
function allHooks(text: string): { url?: string; command?: string }[] {
  const root = JSON.parse(text) as { hooks: Record<string, { hooks: { url?: string; command?: string }[] }[]> };
  return Object.values(root.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks));
}

describe('flow-tower hooks', () => {
  it('install into an empty home writes settings.json with the port and the quoted node path', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    const r = await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('port 5999 (--port)');
    expect(r.stdout).toContain('claude-code: ~/.claude/settings.json: 11 hooks wired on port 5999');
    const text = readFileSync(settingsOf(box.home), 'utf8');
    expect(text).toContain('http://127.0.0.1:5999/api/events?source=claude-code');
    expect(text).not.toContain('5317');
    // The command hook names the node binary and the CLI, both quoted.
    const command = allHooks(text).find((h) => h.command !== undefined)?.command ?? '';
    // FLOW_TOWER_HOME is set in this test's env, so the command carries it as a prefix.
    expect(command).toMatch(/^FLOW_TOWER_HOME="[^"]+" "[^"]+" "[^"]+bin[\\/]flow-tower\.js" emit --source claude-code$/);
    expect(command).not.toContain('--token');
  });

  it('a second install says already up to date', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    const again = await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('claude-code: ~/.claude/settings.json: already up to date');
  });

  it('keeps a pre-existing user hook and the backup holds the old file', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    const userHook = { hooks: [{ type: 'command', command: 'echo user-hook' }] };
    writeFileSync(settingsOf(box.home), JSON.stringify({ hooks: { Stop: [userHook] } }));
    const r = await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('backup: settings.json.flow-tower.bak');
    expect(allHooks(readFileSync(settingsOf(box.home), 'utf8')).some((h) => h.command === 'echo user-hook')).toBe(true);
    expect(existsSync(settingsOf(box.home) + '.flow-tower.bak')).toBe(true);
  });

  it('status reports the wired port and no library running', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    const r = await hooks(['status'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('wired on port 5999 (no library running)');
  });

  it('uninstall leaves the user hook in place', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    writeFileSync(settingsOf(box.home), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }] } }));
    await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    const r = await hooks(['uninstall', '--target', 'claude-code'], box);
    expect(r.status).toBe(0);
    const left = allHooks(readFileSync(settingsOf(box.home), 'utf8'));
    expect(left).toEqual([{ type: 'command', command: 'echo user-hook' }]);
  });

  it('--dry-run prints the change and writes nothing', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    const r = await hooks(['install', '--target', 'claude-code', '--port', '5999', '--dry-run'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('dry run: nothing written');
    expect(existsSync(settingsOf(box.home))).toBe(false);
  });

  it('detection with only ~/.codex present wires codex only', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.codex'));
    const r = await hooks(['install', '--port', '5999'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('codex: ~/.codex/hooks.json');
    expect(r.stdout).not.toContain('claude-code: ~/.claude');
    expect(existsSync(join(box.home, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(settingsOf(box.home))).toBe(false);
  });

  it('a broken JSON file is left untouched and exits 1', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    const broken = '{ "hooks": [ not json';
    writeFileSync(settingsOf(box.home), broken);
    const r = await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not valid JSON');
    expect(readFileSync(settingsOf(box.home), 'utf8')).toBe(broken);
  });
});
