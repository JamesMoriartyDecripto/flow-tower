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
    expect(command).toMatch(/^FLOW_TOWER_HOME='[^']+' '[^']+' '[^']+bin[\\/]flow-tower\.js' emit --source claude-code$/);
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

  it('codex status after install says wired, not not-wired, though its command hooks carry no port', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.codex'));
    await hooks(['install', '--target', 'codex', '--port', '5999'], box);
    const r = await hooks(['status'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('codex: ~/.codex/hooks.json: wired (emit finds the running library)');
    expect(r.stdout).not.toMatch(/codex: ~\/\.codex\/hooks\.json: not wired/);
  });

  it('status reports a node path that no longer exists', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.codex'));
    await hooks(['install', '--target', 'codex', '--port', '5999'], box);
    const file = join(box.home, '.codex', 'hooks.json');
    // Simulate a node upgrade: point the pinned node path at a binary that is gone.
    const gone = join(root, 'gone-node-v0.0.0', 'bin', 'node');
    const text = readFileSync(file, 'utf8').split(process.execPath).join(gone);
    writeFileSync(file, text);
    const r = await hooks(['status'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`node not found at ${gone}: run flow-tower hooks install again`);
  });

  it('uninstall deletes a settings file that held only our hooks, and keeps the backup', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    const r = await hooks(['uninstall', '--target', 'claude-code'], box);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('removed the file (it held only flow-tower hooks)');
    expect(existsSync(settingsOf(box.home))).toBe(false);
    expect(existsSync(settingsOf(box.home) + '.flow-tower.bak')).toBe(true);
  });

  it('a FLOW_TOWER_HOME with shell metacharacters runs as data, not code, and comes back verbatim', async () => {
    // The emit command is run through sh with `printenv` in place of node: if quoting failed, touch would run.
    const { execFileSync } = await import('node:child_process');
    const { hookCommand, shellQuote } = await import('../src/cli/hooks.ts');
    const dir = join(root, 'inject');
    mkdirSync(dir, { recursive: true });
    const evil = `/tmp/x"$(touch ${join(dir, 'PWNED')})'a b`;
    const cmd = hookCommand({
      home: dir, cwd: dir, checkout: '/x', env: { FLOW_TOWER_HOME: evil },
    });
    const prefix = cmd.slice(0, cmd.indexOf(` ${shellQuote(process.execPath)} `));
    const out = execFileSync('sh', ['-c', `${prefix} printenv FLOW_TOWER_HOME`], { encoding: 'utf8' });
    expect(out.replace(/\n$/, '')).toBe(evil);
    expect(existsSync(join(dir, 'PWNED'))).toBe(false);
  });

  it('a settings file that is a symlink is written through, the link stays, and the real file is backed up', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.claude'));
    const real = join(box.home, 'dotfiles', 'settings.json');
    mkdirSync(join(box.home, 'dotfiles'));
    writeFileSync(real, JSON.stringify({ model: 'x' }));
    const { symlinkSync, lstatSync } = await import('node:fs');
    symlinkSync(real, settingsOf(box.home));
    const r = await hooks(['install', '--target', 'claude-code', '--port', '5999'], box);
    expect(r.status).toBe(0);
    expect(lstatSync(settingsOf(box.home)).isSymbolicLink()).toBe(true);
    expect(allHooks(readFileSync(real, 'utf8')).length).toBeGreaterThan(0);
    expect(existsSync(real + '.flow-tower.bak')).toBe(true);
  });

  it('install leaves a flow-tower.ts that is not ours alone and exits 1', TIMEOUT, async () => {
    const box = sandbox();
    const piFile = join(box.home, '.pi', 'agent', 'extensions', 'flow-tower.ts');
    mkdirSync(join(box.home, '.pi', 'agent', 'extensions'), { recursive: true });
    writeFileSync(piFile, '// my own extension\nexport {};\n');
    const r = await hooks(['install', '--target', 'pi', '--port', '5999'], box);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pi: ~/.pi/agent/extensions/flow-tower.ts exists and was not written by flow-tower: left as is');
    expect(readFileSync(piFile, 'utf8')).toBe('// my own extension\nexport {};\n');
  });

  it('uninstall keeps a hand-edited Pi extension and deletes an untouched one', TIMEOUT, async () => {
    const box = sandbox();
    const piFile = join(box.home, '.pi', 'agent', 'extensions', 'flow-tower.ts');
    mkdirSync(join(box.home, '.pi', 'agent', 'extensions'), { recursive: true });
    await hooks(['install', '--target', 'pi', '--port', '5999'], box);
    writeFileSync(piFile, readFileSync(piFile, 'utf8') + '// edited\n');
    const edited = await hooks(['uninstall', '--target', 'pi'], box);
    expect(edited.stdout).toContain('left in place (edited by hand)');
    expect(existsSync(piFile)).toBe(true);
    await hooks(['install', '--target', 'pi', '--port', '5999'], box);
    const clean = await hooks(['uninstall', '--target', 'pi'], box);
    expect(clean.stdout).toContain('removed 1 extension');
    expect(existsSync(piFile)).toBe(false);
  });

  it('dry run and an up-to-date file print no next-step line', TIMEOUT, async () => {
    const box = sandbox();
    mkdirSync(join(box.home, '.codex'));
    const dry = await hooks(['install', '--target', 'codex', '--port', '5999', '--dry-run'], box);
    expect(dry.stdout).not.toContain('approve them once');
    await hooks(['install', '--target', 'codex', '--port', '5999'], box);
    const again = await hooks(['install', '--target', 'codex', '--port', '5999'], box);
    expect(again.stdout).toContain('already up to date');
    expect(again.stdout).not.toContain('approve them once');
  });
});
