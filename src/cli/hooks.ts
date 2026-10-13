/**
 * `flow-tower hooks install|status|uninstall` (#189): wires the shipped integrations/ hook configs into each
 * harness's settings, so a user does not copy JSON by hand. The merge is pure (hooks-merge.ts); this file
 * does the file IO, the port choice and the output. Everything that touches the home folder takes a context,
 * so tests run against a temp HOME.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { localServerUrl } from '../../bin/local-server.js';
import {
  type Harness, type MergeResult, mergeHermes, mergeJsonHooks, piExtension, staleCommandPath, unmergeHermes, unmergeJsonHooks,
  wired, wiredPort,
} from './hooks-merge.ts';

const HARNESSES: Harness[] = ['claude-code', 'codex', 'pi', 'hermes'];
const DEFAULT_PORT = 5317;
const BACKUP_SUFFIX = '.flow-tower.bak';
// Written as the first line of the Pi extension we install: uninstall deletes the file only when it finds it,
// so a Pi extension the user wrote by hand is never removed.
const PI_MARK = '// Installed by flow-tower hooks install';
const USAGE = 'usage: flow-tower hooks install|status|uninstall [--target claude-code|codex|pi|hermes|all] [--project] [--port N] [--dry-run]';

const DETECT_DIR: Record<Harness, string> = { 'claude-code': '.claude', codex: '.codex', pi: '.pi', hermes: '.hermes' };
const TEMPLATE: Record<Harness, string> = {
  'claude-code': 'integrations/claude-code/settings.json',
  codex: 'integrations/codex/hooks.json',
  pi: 'integrations/pi/flow-tower.ts',
  hermes: 'integrations/hermes/config.yaml',
};

export interface HooksContext {
  /** The user's home: where ~/.claude and friends live. Tests pass a temp dir. */
  home: string;
  /** The project level is relative to this folder. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** The flow-tower checkout: the templates and bin/flow-tower.js live under it. */
  checkout: string;
}

export function defaultContext(): HooksContext {
  return {
    home: homedir(),
    cwd: process.cwd(),
    env: process.env,
    checkout: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  };
}

/** The user-level or project-level settings file; undefined when the harness has no such level. */
function fileFor(h: Harness, project: boolean, ctx: HooksContext): string | undefined {
  const base = project ? ctx.cwd : ctx.home;
  if (h === 'claude-code') return join(base, '.claude', 'settings.json');
  if (h === 'codex') return join(base, '.codex', 'hooks.json');
  if (h === 'pi') return project ? join(base, '.pi', 'extensions', 'flow-tower.ts') : join(base, '.pi', 'agent', 'extensions', 'flow-tower.ts');
  // Hermes reads one global config; a project-level file would not be read by Hermes.
  return project ? undefined : join(base, '.hermes', 'config.yaml');
}

/** `~/…` for the user level, `./…` for the project level, so the output names the file the way the user sees it. */
function shown(file: string, ctx: HooksContext): string {
  if (file.startsWith(ctx.home + sep)) return `~${file.slice(ctx.home.length)}`;
  return `./${relative(ctx.cwd, file)}`;
}

/** The emit command the hooks run. Quoted paths survive spaces; FLOW_TOWER_HOME is carried so the hook reads the same folder. */
export function hookCommand(ctx: HooksContext): string {
  const cli = join(ctx.checkout, 'bin', 'flow-tower.js');
  const home = ctx.env.FLOW_TOWER_HOME;
  // No --token here: emit must never hand the config token to another origin.
  const prefix = home ? `FLOW_TOWER_HOME="${home}" ` : '';
  return `${prefix}"${process.execPath}" "${cli}" emit`;
}

/** The port the running library listens on, or undefined when no library is running. */
function runningPort(ctx: HooksContext): number | undefined {
  const url = localServerUrl({ env: ctx.env, home: userFolder(ctx) });
  if (!url) return undefined;
  try {
    return Number(new URL(url).port) || undefined;
  } catch {
    return undefined;
  }
}

function userFolder(ctx: HooksContext): string {
  return ctx.env.FLOW_TOWER_HOME || join(ctx.home, '.config', 'flow-tower');
}

function parsePort(text: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid --port "${text}": use 1-65535`);
  return n;
}

/** The port to wire: --port, else the library running now, else the default. Says which and why. */
function choosePort(typed: string | undefined, ctx: HooksContext): { port: number; line: string } {
  if (typed !== undefined) {
    const port = parsePort(typed);
    return { port, line: `port ${port} (--port)` };
  }
  const running = runningPort(ctx);
  if (running !== undefined) return { port: running, line: `port ${running} (the library running now)` };
  return { port: DEFAULT_PORT, line: `port ${DEFAULT_PORT} (default: no library running)` };
}

function readIfExists(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** The merged result for one harness. Pi and Hermes are whole-file or YAML merges; the JSON ones are pure. */
function mergeFor(h: Harness, existing: string | undefined, port: number, ctx: HooksContext): MergeResult {
  const template = readFileSync(join(ctx.checkout, TEMPLATE[h]), 'utf8');
  if (h === 'pi') {
    const text = piExtension(template, port);
    return { text, changed: text !== (existing ?? ''), added: 1, replaced: 0, removed: 0 };
  }
  if (h === 'hermes') return mergeHermes(existing, template, port);
  return mergeJsonHooks(h, existing, template, { port, command: hookCommand(ctx) });
}

/** Writes via a temp file in the same folder, then renames: a crash leaves the old file or the new one, never half. */
function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** Copies the existing file to the backup (overwriting an older one) before the change. Returns the backup's name. */
function backupThenWrite(file: string, existing: string | undefined, text: string): string | undefined {
  let backup: string | undefined;
  if (existing !== undefined) {
    copyFileSync(file, file + BACKUP_SUFFIX);
    backup = basename(file) + BACKUP_SUFFIX;
  }
  writeAtomic(file, text);
  return backup;
}

const noun = (h: Harness) => (h === 'pi' ? 'extension' : 'hooks');

function install(targets: Harness[], o: { project: boolean; port: { port: number; line: string }; dryRun: boolean }, ctx: HooksContext): number {
  let code = 0;
  const done: Harness[] = [];
  console.log(`using ${o.port.line}`);
  for (const h of targets) {
    const file = fileFor(h, o.project, ctx);
    if (!file) {
      console.log(`${h}: no project level: skipped`);
      continue;
    }
    const label = `${h}: ${shown(file, ctx)}`;
    try {
      const existing = readIfExists(file);
      const r = mergeFor(h, existing, o.port.port, ctx);
      done.push(h);
      if (!r.changed) {
        console.log(`${label}: already up to date`);
        continue;
      }
      const count = h === 'pi' ? 1 : r.added;
      if (o.dryRun) {
        console.log(`${label}: would wire ${count} ${noun(h)} on port ${o.port.port} (dry run: nothing written)`);
        continue;
      }
      const backup = backupThenWrite(file, existing, r.text);
      console.log(`${label}: ${count} ${noun(h)} wired on port ${o.port.port}${backup ? ` (backup: ${backup})` : ''}`);
    } catch (err) {
      // Only the message: the merge errors are written not to echo the file's text, which may hold tokens.
      console.error(`${label}: ${(err as Error).message}`);
      code = 1;
    }
  }
  for (const h of done) console.log(nextStep(h));
  // The SDK file's URL is fixed at 5317, so the port is named only when the install wires another one.
  const portPart = o.port.port === DEFAULT_PORT ? '' : ` and set the port in its URL to ${o.port.port}`;
  console.log(`Agent SDK: copy integrations/agent-sdk/flow-tower-hooks.ts into your app${portPart}`);
  return code;
}

function nextStep(h: Harness): string {
  if (h === 'codex') return 'codex: approve them once in Codex with /hooks';
  if (h === 'pi') return 'pi: restart pi';
  if (h === 'hermes') return 'hermes: restart hermes';
  return 'claude-code: new Claude Code sessions send events';
}

function uninstall(targets: Harness[], o: { project: boolean; dryRun: boolean }, ctx: HooksContext): number {
  let code = 0;
  for (const h of targets) {
    const file = fileFor(h, o.project, ctx);
    if (!file) {
      console.log(`${h}: no project level: skipped`);
      continue;
    }
    const label = `${h}: ${shown(file, ctx)}`;
    try {
      const existing = readIfExists(file);
      if (existing === undefined) {
        console.log(`${label}: not wired`);
        continue;
      }
      let r: MergeResult;
      if (h === 'pi') {
        // Only our own file goes: the first line is the installer's mark, anything else is the user's.
        const ours = existing.split('\n', 1)[0].startsWith(PI_MARK);
        r = { text: '', changed: ours, added: 0, replaced: 0, removed: ours ? 1 : 0 };
      } else if (h === 'hermes') {
        r = unmergeHermes(existing);
      } else {
        r = unmergeJsonHooks(h, existing);
      }
      if (!r.changed) {
        console.log(`${label}: not wired`);
        continue;
      }
      const count = h === 'pi' ? 1 : r.removed;
      if (o.dryRun) {
        console.log(`${label}: would remove ${count} ${noun(h)} (dry run: nothing written)`);
        continue;
      }
      // Pi's file is ours alone, so it is removed; the backup still keeps a copy of it.
      if (h === 'pi') {
        copyFileSync(file, file + BACKUP_SUFFIX);
        rmSync(file, { force: true });
        console.log(`${label}: removed ${count} ${noun(h)} (backup: ${basename(file)}${BACKUP_SUFFIX})`);
        continue;
      }
      // A file that held only our hooks would be left as `{}`: delete it, the backup keeps the old text.
      if (r.emptied) {
        copyFileSync(file, file + BACKUP_SUFFIX);
        rmSync(file, { force: true });
        console.log(`${label}: removed ${count} ${noun(h)} (backup: ${basename(file)}${BACKUP_SUFFIX}); removed the file (it held only flow-tower hooks)`);
        continue;
      }
      const backup = backupThenWrite(file, existing, r.text);
      console.log(`${label}: removed ${count} ${noun(h)}${backup ? ` (backup: ${backup})` : ''}`);
    } catch (err) {
      console.error(`${label}: ${(err as Error).message}`);
      code = 1;
    }
  }
  return code;
}

function status(ctx: HooksContext): number {
  const running = runningPort(ctx);
  for (const h of HARNESSES) {
    for (const project of [false, true]) {
      const file = fileFor(h, project, ctx);
      if (!file) {
        console.log(`${h}: no project level`);
        continue;
      }
      const label = `${h}: ${shown(file, ctx)}`;
      const text = readIfExists(file) ?? '';
      if (!wired(h, text)) {
        console.log(`${label}: not wired`);
        continue;
      }
      const port = wiredPort(h, text);
      if (port === undefined) {
        // Command hooks carry no port: emit finds whichever library runs now.
        const state = running === undefined ? 'no library running now' : `library running on port ${running}`;
        console.log(`${label}: wired (emit finds the running library) (${state})`);
      } else {
        let note: string;
        if (running === undefined) note = '(no library running)';
        else if (running === port) note = '(matches the running library)';
        else note = `(the running library is on port ${running}: run flow-tower hooks install)`;
        console.log(`${label}: wired on port ${port} ${note}`);
      }
      const stale = staleCommandPath(h, text, existsSync);
      if (stale !== undefined) console.log(`${label}: node not found at ${stale}: run flow-tower hooks install again`);
    }
  }
  return 0;
}

/** The targets for install: --target, else every harness whose folder exists. */
function pickTargets(target: string | undefined, ctx: HooksContext): Harness[] | string {
  if (target === undefined) {
    const found = HARNESSES.filter((h) => existsSync(join(ctx.home, DETECT_DIR[h])));
    if (found.length === 0) {
      return 'no coding agent found (~/.claude, ~/.codex, ~/.pi, ~/.hermes): pick one with --target claude-code|codex|pi|hermes|all';
    }
    return found;
  }
  if (target === 'all') return HARNESSES;
  if ((HARNESSES as string[]).includes(target)) return [target as Harness];
  return `unknown target "${target}": use claude-code, codex, pi, hermes or all`;
}

/** Runs one `flow-tower hooks` command. Returns the exit code. */
export function runHooks(argv: string[], ctx: HooksContext = defaultContext()): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        target: { type: 'string' },
        project: { type: 'boolean', default: false },
        port: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
    });
  } catch (err) {
    console.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const action = positionals[0];
  if (positionals.length !== 1 || !['install', 'status', 'uninstall'].includes(action)) {
    console.error(USAGE);
    return 2;
  }
  if (action === 'status') return status(ctx);

  let port: { port: number; line: string } | undefined;
  if (action === 'install') {
    try {
      port = choosePort(values.port, ctx);
    } catch (err) {
      console.error((err as Error).message);
      return 2;
    }
  }
  const picked = pickTargets(values.target, ctx);
  if (typeof picked === 'string') {
    // Uninstall with no target covers every harness: it removes only our entries, so that is safe.
    if (action === 'uninstall' && values.target === undefined) {
      return uninstall(HARNESSES, { project: values.project, dryRun: values['dry-run'] }, ctx);
    }
    console.error(picked);
    return 1;
  }
  if (action === 'uninstall') return uninstall(picked, { project: values.project, dryRun: values['dry-run'] }, ctx);
  return install(picked, { project: values.project, port: port!, dryRun: values['dry-run'] }, ctx);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runHooks(process.argv.slice(2)));
}
