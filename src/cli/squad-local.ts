/**
 * Portable Dev Squad doctor (#334): `squad doctor <dir>` checks that a project is ready for the squad's runner
 * scripts with no paid call, no repository code run and no SDK. The lead is the user's current coding session
 * (Pi, Codex, Claude Code, Hermes), which drives the squad through the flow-tower-squad skill. There is no
 * autonomous run entry here: `squad run` only explains how to start the work in the current harness.
 * The one external program is a fixed `git --version` probe, started without a shell and injected for tests.
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, lstatSync, readFileSync, statSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { userHome } from '../core/secrets.ts';
// The runner's own loader: doctor and `squad run` must agree on what a valid squad.json is. It only reads data.
import { loadConfig } from '../../tools/squad/config.mjs';

/** A finished subprocess: status null means it did not run to an exit code (missing binary, signal). */
export interface Probe { status: number | null; stdout: string; stderr: string; error?: Error }
/** Starts a fixed binary with an argument list, no shell. Injected so tests can fake it. */
export type Exec = (cmd: string, args: string[]) => Probe;

export interface Check { name: string; ok: boolean; detail: string }

/** The OpenRouter key file: the same user-folder file the squad key command writes (see squad.ts). */
const DOT = '.' + 'env';
const KEY_LINE = /^\s*OPENROUTER_API_KEY=(.*)$/m;
const KEY_NAME = 'OPENROUTER_API_KEY';
/** The lowest Node that strips TypeScript types, which the flow-tower CLI itself needs (see bin/commands.js). */
const MIN_NODE = [22, 12, 0];
/**
 * Every runner file init distributes into tools/squad/ (a static registry: the set is fixed per release). A missing one
 * means a partial install. Only the regular files are checked; they are never executed here.
 */
export const RUNNER_FILES = [
  'args.mjs', 'batch.mjs', 'batch.d.mts', 'config.mjs', 'config.d.mts', 'cost.mjs', 'ev.sh', 'files-check.mjs',
  'gate.mjs', 'guard.mjs', 'ledger.mjs', 'log-prune.mjs', 'mode.mjs', 'mode.d.mts', 'oneshot.mjs', 'pack.mjs', 'prs.mjs',
  'roles.mjs', 'run.mjs', 'step-limit.mjs', 'step-scope.mjs', 'steps.sh', 'tool-schema.mjs',
];

const defaultExec: Exec = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', shell: false });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
};

/** The project's git root, or undefined when the folder is not in a git repository. */
export function gitRoot(dir: string, exec: Exec = defaultExec): string | undefined {
  const r = exec('git', ['-C', dir, 'rev-parse', '--show-toplevel']);
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/** Whether `version` (like "v22.12.0") is at least MIN_NODE. Unparseable input is not accepted. */
export function nodeAtLeastMin(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!m) return false;
  const got = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (let i = 0; i < MIN_NODE.length; i++) {
    if (got[i] !== MIN_NODE[i]) return got[i] > MIN_NODE[i];
  }
  return true;
}

/** The entry's lstat, or undefined when absent. lstat does not follow links, so a symlink is never a regular file. */
function entry(path: string): Stats | undefined {
  try { return lstatSync(path); } catch { return undefined; }
}

/** Whether the OpenRouter key is set: presence only, never the value. Environment first, then the user key file. */
export function credentialSource(env: NodeJS.ProcessEnv, keyFile: string): string | undefined {
  if (env[KEY_NAME]?.trim()) return `environment (${KEY_NAME})`;
  // A directory, a FIFO or an unreadable file counts as no key: doctor must report it, never throw on it.
  try {
    if (!statSync(keyFile).isFile()) return undefined;
    const m = KEY_LINE.exec(readFileSync(keyFile, 'utf8'));
    if (m?.[1]?.trim()) return keyFile;
  } catch { /* absent or unreadable: the same as no key */ }
  return undefined;
}

/**
 * Reduces a loader error to a fixed reason. JSON parse errors can quote the file's text and a bad-dir error quotes
 * the value, so only the reason words are kept: the detail never carries config content.
 */
function safeReason(e: unknown): string {
  if ((e as NodeJS.ErrnoException)?.code === 'EACCES' || (e as NodeJS.ErrnoException)?.code === 'EPERM') return 'not readable';
  const msg = e instanceof Error ? e.message : '';
  if (msg.includes('not valid JSON')) return 'not valid JSON';
  if (msg.includes('the config must be a JSON object')) return 'the config must be a JSON object';
  // Loader key errors read `"key" <reason>`; the reason may quote a value, so it is cut at the first colon or quote.
  const m = /"([\w.]+)" ((?:must|may|has a bad dir)[^:"]*)/.exec(msg);
  return m ? `"${m[1]}" ${m[2]}`.trim() : 'not readable or not valid';
}

/**
 * The squad config check, through the runner's loader (config.mjs), from the git root as run.mjs does.
 * A non-regular file (directory, FIFO) is refused before the loader reads it, so no read can block or throw a stack.
 */
function configCheck(root: string, file: string, dir: string): Check {
  const name = 'squad config';
  const st = entry(file);
  if (!st) return { name, ok: false, detail: `missing: run flow-tower squad init ${dir}` };
  if (!st.isFile()) return { name, ok: false, detail: `${file}: not a regular file` };
  try {
    accessSync(file, constants.R_OK);
    loadConfig(root);
    return { name, ok: true, detail: file };
  } catch (e) {
    return { name, ok: false, detail: `${file}: ${safeReason(e)}` };
  }
}

/** Paths of the installed squad inside a project root. */
function layout(root: string) {
  const squadDir = join(root, 'tools', 'squad');
  return { squadDir, config: join(squadDir, 'squad.json') };
}

/** The check for a fixed prerequisite binary, probed with its `--version`. Never a repo script. */
function gitCheck(exec: Exec): Check {
  const r = exec('git', ['--version']);
  const ok = r.status === 0 && !r.error;
  return { name: 'git on PATH', ok, detail: ok ? r.stdout.trim().split('\n')[0] : 'install git and make sure it is on PATH' };
}

/**
 * Every doctor check, in order. Makes no paid or model call and starts only `git --version` and `git rev-parse`.
 * Node is read from the running process, not probed. A failing check says what to do next.
 */
export function doctor(dir: string, opts: { exec?: Exec; env?: NodeJS.ProcessEnv; keyFile?: string; nodeVersion?: string } = {}): Check[] {
  const exec = opts.exec ?? defaultExec;
  const env = opts.env ?? process.env;
  const keyFile = opts.keyFile ?? join(userHome(), DOT);
  const nodeVersion = opts.nodeVersion ?? process.versions.node;
  const checks: Check[] = [];

  const root = gitRoot(dir, exec);
  checks.push({ name: 'git repository', ok: !!root, detail: root ?? `not a git repository: ${dir}` });
  if (!root) return checks;

  const p = layout(root);
  const node = nodeAtLeastMin(nodeVersion);
  checks.push({
    name: 'node version',
    ok: node,
    detail: node ? `v${nodeVersion.replace(/^v/, '')}` : `Node ${MIN_NODE.join('.')} or newer is needed (found v${nodeVersion.replace(/^v/, '')})`,
  });

  checks.push(configCheck(root, p.config, dir));

  const missing = RUNNER_FILES.filter((f) => !entry(join(p.squadDir, f))?.isFile());
  checks.push({
    name: 'runner files',
    ok: missing.length === 0,
    detail: missing.length === 0 ? `${RUNNER_FILES.length} present` : `missing: ${missing.join(', ')}: run flow-tower squad init ${dir} --force`,
  });

  checks.push(gitCheck(exec));

  const cred = credentialSource(env, keyFile);
  checks.push({
    name: 'OpenRouter key',
    ok: !!cred,
    detail: cred ? `found in ${cred}` : `missing: run flow-tower squad key, or export ${KEY_NAME}`,
  });

  checks.push({
    name: 'trust',
    ok: true,
    detail: 'the squad runs the repo\'s own checks and tests: use it only on code and tests you trust. Your current session is the lead.',
  });
  return checks;
}

/**
 * The answer to `squad run`. The portable runner has no autonomous run entry, so nothing is started and the
 * command fails. The message points at the harness-based path, so the user is not left guessing.
 */
export function unsupportedRun(): number {
  console.error([
    'squad run is not available: this CLI does not run issues by itself, so nothing was started.',
    'Use your current harness with the flow-tower-squad skill: ask it to use the Dev Squad on the issue.',
    'The lead plans and writes task files; the squad\'s models do the coding through tools/squad/steps.sh.',
    'Run `flow-tower squad doctor <dir>` first, and `flow-tower install-skill --target <harness>` if the skill is missing.',
  ].join('\n'));
  return 2;
}
