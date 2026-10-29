/**
 * Portable Dev Squad doctor (#334): `squad doctor <dir>` checks that a project is ready for the squad's runner
 * scripts with no paid call, no repository code run and no SDK. The lead is the user's current coding session
 * (Pi, Codex, Claude Code, Hermes), which drives the squad through the flow-tower-squad skill. There is no
 * autonomous run entry here: `squad run` only explains how to start the work in the current harness.
 * The one external program is a fixed `git --version` probe, started without a shell and injected for tests.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { userHome } from '../core/secrets.ts';

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
/** Runner files init copies into tools/squad/ and the lead's steps depend on; a missing one means a partial install. */
const RUNNER_FILES = ['steps.sh', 'run.mjs', 'pack.mjs', 'config.mjs', 'gate.mjs'];

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

/**
 * Whether squad.json is valid for the runner. Parsed as data only, never imported or executed. A message names
 * the offending key, never the file's content: a malformed file can hold a credential.
 */
export function configProblem(text: string): string | undefined {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return 'not valid JSON'; }
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(raw)) return 'the config must be a JSON object';
  if (raw.commands !== undefined && !isObj(raw.commands)) return 'commands must be an object';
  const check = isObj(raw.commands) ? raw.commands.check : undefined;
  if (typeof check !== 'string' || check.trim() === '') return 'commands.check must be a non-empty string';
  if (raw.models !== undefined) {
    if (!isObj(raw.models)) return 'models must be an object';
    for (const [name, m] of Object.entries(raw.models)) if (typeof m !== 'string') return `models.${name} must be a string`;
  }
  return undefined;
}

/** Whether the OpenRouter key is set: presence only, never the value. Environment first, then the user key file. */
export function credentialSource(env: NodeJS.ProcessEnv, keyFile: string): string | undefined {
  if (env[KEY_NAME]?.trim()) return `environment (${KEY_NAME})`;
  if (existsSync(keyFile)) {
    const m = KEY_LINE.exec(readFileSync(keyFile, 'utf8'));
    if (m?.[1]?.trim()) return keyFile;
  }
  return undefined;
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

  const config = existsSync(p.config);
  const problem = config ? configProblem(readFileSync(p.config, 'utf8')) : undefined;
  checks.push({
    name: 'squad config',
    ok: config && !problem,
    detail: !config ? `missing: run flow-tower squad init ${dir}` : problem ? `${p.config}: ${problem}` : p.config,
  });

  const missing = RUNNER_FILES.filter((f) => !existsSync(join(p.squadDir, f)));
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
