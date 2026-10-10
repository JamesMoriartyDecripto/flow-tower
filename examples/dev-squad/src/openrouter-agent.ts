import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import type { AgentRun } from './run-agent';

const sh = promisify(execFile);
const API = 'https://openrouter.ai/api/v1/chat/completions';
const EVENTS = env.FLOW_TOWER_URL ?? 'http://127.0.0.1:5317/api/events';
const READ_LINES = 400; // per read_file call: long files are paged, not dumped into context
const OUT_CHARS = 20_000;

/**
 * No Claude Code hooks run here, so the fences are in code: never touch dotenv files, keys,
 * git internals, dependencies, SSH material or anything that names the user folder.
 */
const SECRET = /(^|\/)(\.env[^/]*|\.git|node_modules|\.ssh)(\/|$)|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519)|^~|\/(Users|home)\//;
const WRITABLE = /^(src|tests|e2e)\//; // the coder writes code and tests, never config, CI or docs

/** No shell: each command is a fixed argv, the model only picks the name and (for some) a path. */
const RUN: Record<string, (arg: string) => [string, string[]]> = {
  check: () => ['npm', ['run', 'check']],
  typecheck: () => ['npx', ['tsc', '--noEmit']],
  vitest: (file) => ['npx', ['vitest', 'run', file]],
  diff: () => ['git', ['diff', 'origin/main']],
  status: () => ['git', ['status', '--short']],
  validate: (file) => ['node', ['bin/flow-tower.js', 'validate', file, '--json']],
  // The auditor's SAST: the Semgrep MCP is a Claude-session tool, so the CLI with the same rulesets.
  semgrep: () => ['semgrep', ['scan', '--config=p/default', '--config=p/owasp-top-ten', '--config=p/secrets', '--json', '--quiet']],
};

const str = (description: string) => ({ type: 'string', description });
const fn = (name: string, description: string, properties: Record<string, object>, required = Object.keys(properties)) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

const READ_TOOLS = [
  fn('list_files', 'Tracked files under a directory (git ls-files).', { dir: str('Directory, "." for all') }),
  fn('read_file', `A file with line numbers, ${READ_LINES} lines from offset.`, { path: str('Path'), offset: { type: 'number' } }, ['path']),
  fn('grep', 'git grep -n over tracked files.', { pattern: str('Regex'), dir: str('Optional directory') }, ['pattern']),
  fn('run', `One whitelisted command: ${Object.keys(RUN).join(', ')}.`, { name: { type: 'string', enum: Object.keys(RUN) }, file: str('For vitest / validate') }, ['name']),
  fn('finish', 'End the run with the final report (the JSON or STATUS block your instructions ask for).', { report: str('Final report') }),
];
const WRITE_TOOLS = [
  fn('edit_file', 'Replace one exact, unique snippet.', { path: str('Path'), old: str('Exact text, must occur once'), new: str('Replacement') }),
  fn('write_file', 'Create or overwrite a file under src/, tests/ or e2e/.', { path: str('Path'), content: str('Full content') }),
];

/** Fire-and-forget live events for the tower: a stopped viewer never slows or breaks a run. */
function emit(event: Record<string, unknown>) {
  fetch(EVENTS, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'openrouter', ts: Date.now(), ...event }), signal: AbortSignal.timeout(1_500) }).catch(() => undefined);
}

/** Resolves a model-supplied path inside the worktree, or throws. */
function safePath(cwd: string, path: string, write = false): string {
  const abs = resolve(cwd, path);
  const rel = relative(cwd, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || SECRET.test(rel) || SECRET.test(path)) throw new Error(`path denied: ${path}`);
  if (write && !WRITABLE.test(rel)) throw new Error(`write denied outside src/, tests/, e2e/: ${rel}`);
  return abs;
}

async function exec(cwd: string, [cmd, args]: [string, string[]]) {
  const r = await sh(cmd, args, { cwd, timeout: 300_000, maxBuffer: 8 << 20 }).catch((e) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? e.message }));
  return `${r.stdout}${r.stderr}`;
}

async function callTool(cwd: string, name: string, a: Record<string, string>): Promise<string> {
  const clean = (out: string) => out.split('\n').filter((l) => !SECRET.test(l.split(':')[0])).join('\n');
  switch (name) {
    case 'list_files': return clean(await exec(cwd, ['git', ['ls-files', '--', a.dir === '.' ? '.' : relative(cwd, safePath(cwd, a.dir))]]));
    case 'grep': return clean(await exec(cwd, ['git', ['grep', '-n', '-I', '-e', a.pattern, '--', a.dir ? relative(cwd, safePath(cwd, a.dir)) : '.']]));
    case 'read_file': {
      const from = Number(a.offset ?? 0);
      return readFileSync(safePath(cwd, a.path), 'utf8').split('\n').slice(from, from + READ_LINES).map((l, i) => `${from + i + 1}\t${l}`).join('\n');
    }
    case 'edit_file': {
      const abs = safePath(cwd, a.path, true);
      const text = readFileSync(abs, 'utf8');
      const hits = text.split(a.old).length - 1;
      if (hits !== 1) throw new Error(`old text found ${hits} times; it must be unique`);
      writeFileSync(abs, text.replace(a.old, () => a.new));
      return 'edited';
    }
    case 'write_file': {
      const abs = safePath(cwd, a.path, true);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, a.content);
      return `wrote ${a.content.length} chars`;
    }
    case 'run': {
      const file = a.file ? relative(cwd, safePath(cwd, a.file)) : '';
      if (!Object.hasOwn(RUN, a.name)) throw new Error(`not whitelisted: ${a.name}`);
      if ((a.name === 'vitest' || a.name === 'validate') && !file) throw new Error(`${a.name} needs a file`);
      return exec(cwd, RUN[a.name](file));
    }
    default: throw new Error(`unknown tool ${name}`);
  }
}

/**
 * One role as an OpenAI-style tool loop on OpenRouter. `require_parameters` routes only to
 * providers that honour tools; `data_collection: 'deny'` keeps the code out of training sets;
 * `usage.include` returns the cost of each call, so the step and dollar caps hold per run.
 * Reviewers and auditors get read tools only: they grade, they never fix.
 */
export async function runOpenRouterAgent(o: { role: string; model: string; system: string; prompt: string; cwd: string;
  canWrite: boolean; maxSteps: number; maxBudgetUsd: number }): Promise<AgentRun> {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  const session = randomUUID();
  const tools = o.canWrite ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
  const messages: object[] = [{ role: 'system', content: o.system }, { role: 'user', content: o.prompt }];
  const base = { agent: o.role, model: o.model, session };
  let costUsd = 0;
  const end = (ok: boolean, text: string): AgentRun => {
    emit({ ...base, kind: 'agent.end', status: ok ? 'ok' : 'error', cost_usd: costUsd, message: text.slice(0, 200) });
    return { ok, text, costUsd, sessionId: session };
  };
  emit({ ...base, kind: 'agent.start', message: o.prompt.slice(0, 200) });

  for (let step = 1; step <= o.maxSteps; step++) {
    const res = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: o.model, messages, tools, usage: { include: true },
        provider: { require_parameters: true, data_collection: 'deny' } }) });
    if (!res.ok) return end(false, `OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    costUsd += data.usage?.cost ?? 0;
    const msg = data.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) { messages.push({ role: 'user', content: 'Use a tool, or call finish(report) when done.' }); continue; }

    for (const call of msg.tool_calls) {
      const name: string = call.function.name;
      let out: string;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        if (name === 'finish') return end(true, String(args.report));
        if (!tools.some((t) => t.function.name === name)) throw new Error(`${name} is not allowed for ${o.role}`);
        emit({ ...base, kind: 'tool.start', tool: name, call: call.id, message: JSON.stringify(args).slice(0, 160) });
        out = (await callTool(o.cwd, name, args)).slice(0, OUT_CHARS);
        emit({ ...base, kind: 'tool.end', tool: name, call: call.id, status: 'ok' });
      } catch (e) {
        out = `error: ${e instanceof Error ? e.message : String(e)}`; // the model reads it and corrects course
        emit({ ...base, kind: 'tool.end', tool: name, call: call.id, status: 'error', message: out });
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: out });
    }
    if (costUsd > o.maxBudgetUsd) return end(false, `stopped: $${costUsd.toFixed(2)} over the $${o.maxBudgetUsd} cap`);
  }
  return end(false, `stopped: step cap ${o.maxSteps} reached without finish()`);
}
