#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';
import { parseArgs } from 'node:util';

const HELP = `flow-tower — 3D tower visualizer for agentic systems

Usage
  flow-tower <file.tower.yaml | dir> [more files or dirs...] [--port 5317] [--no-open]
  flow-tower init [file.tower.yaml]
  flow-tower emit --source <claude-code|codex|pi|hermes> < payload.json  (hooks; JSONL streams live)
  flow-tower emit --kind <kind> [--agent a] [--tool t] [--node layer.node] [-m text]
  flow-tower validate <file.tower.yaml | dir>... [--json]
  flow-tower guide                                      print the procedure to generate a tower from a codebase
  flow-tower install-skill [--target <t>] [--project]   install it as an Agent Skill for your coding agent
                                                        <t>: claude (default), codex, pi, hermes, cursor, agents

  Directories are scanned recursively for *.tower.yaml. Several projects open as a library.
  Live events: POST JSON to http://127.0.0.1:<port>/api/events (see docs/realtime.md).

Options
  -p, --port     Port to listen on (default 5317)
      --no-open  Do not open the browser
      --url      emit: server URL (default http://127.0.0.1:5317)
  -h, --help     Show this help`;

const STARTER = `# yaml-language-server: $schema=https://raw.githubusercontent.com/JamesMoriartyDecripto/flow-tower/main/schema/flow-tower.schema.json
version: 1
name: My Agent
prompts:
  main: { text: "You are a helpful agent. Task: {{task}}" }
agents:
  main: { model: claude-sonnet-5-5, prompt: main, tools: [search] }
layers:
  - id: flow
    title: Agent Loop
    nodes:
      - { id: input, type: entry, label: User input }
      - { id: agent, agent: main, label: Agent }
      - { id: done, type: decision, label: Done? }
      - { id: answer, type: output, label: Answer }
    edges:
      - input -> agent
      - agent -> done
      - "done -> agent [return]: no"
      - "done -> answer: yes"
  - id: tools
    title: Tools
    nodes:
      - { id: search, type: tool, label: Web search }
links:
  - flow.agent -> tools.search [call]
`;

// Agent Skills folders (SKILL.md standard, agentskills.io), verified against each harness's docs.
// user = under $HOME, project = under the current directory.
const SKILL_TARGETS = {
  claude: { user: ['.claude', 'skills'], project: ['.claude', 'skills'], note: 'ask Claude Code: "map this agent system into a flow tower"' },
  codex: { user: ['.agents', 'skills'], project: ['.agents', 'skills'], note: 'restart Codex, then ask "map this agent system into a flow tower" or mention $flow-tower' },
  pi: { user: ['.pi', 'agent', 'skills'], project: ['.pi', 'skills'], note: 'restart Pi (project skills load once the project is trusted), then ask "map this agent system into a flow tower"' },
  hermes: { user: ['.hermes', 'skills'], project: ['.hermes', 'skills'], note: 'project skills need a git repo and "hermes skills trust"; then ask Hermes "map this agent system into a flow tower" or use /flow-tower' },
  cursor: { user: ['.cursor', 'skills'], project: ['.cursor', 'skills'], note: 'ask the Cursor agent: "map this agent system into a flow tower"' },
  agents: { user: ['.agents', 'skills'], project: ['.agents', 'skills'], note: 'shared .agents/skills folder, read by Codex, Pi, Cursor and other Agent Skills clients (Hermes: project only)' },
};

/** docs/generate-a-tower.md with the checkout path filled in and relative links made absolute. */
function procedure() {
  const docs = join(pkgRoot, 'docs');
  return readFileSync(join(docs, 'generate-a-tower.md'), 'utf8')
    .replaceAll('<flow-tower>/', `${pkgRoot}/`)
    .replace(/\]\((?!https?:|#|\/)([^)\s]+)\)/g, (_, rel) => `](${resolve(docs, rel)})`);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p', default: '5317' },
    'no-open': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    // emit
    url: { type: 'string', default: 'http://127.0.0.1:5317' },
    source: { type: 'string' },
    kind: { type: 'string' },
    agent: { type: 'string' },
    tool: { type: 'string' },
    node: { type: 'string' },
    tower: { type: 'string' },
    status: { type: 'string' },
    message: { type: 'string', short: 'm' },
    json: { type: 'boolean', default: false },
    project: { type: 'boolean', default: false },
    target: { type: 'string', default: 'claude' },
  },
});

if (values.help || positionals.length === 0) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}

if (positionals[0] === 'emit') {
  await emit();
  process.exit(0);
}

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

if (positionals[0] === 'validate') {
  // The core is TypeScript: run it with Node's built-in type stripping (Node >= 22.12).
  const script = join(pkgRoot, 'src', 'cli', 'validate.ts');
  const args = [...positionals.slice(1), ...(process.argv.includes('--json') ? ['--json'] : [])];
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', script, ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (positionals[0] === 'guide') {
  console.log(procedure());
  process.exit(0);
}

if (positionals[0] === 'install-skill') {
  const spec = SKILL_TARGETS[values.target];
  if (!spec) {
    console.error(`unknown target "${values.target}". Verified targets: ${Object.keys(SKILL_TARGETS).join(', ')}.
Other agents: use --target agents if they read .agents/skills (Agent Skills standard),
or have them run "node ${join(pkgRoot, 'bin', 'flow-tower.js')} guide" and follow the procedure.`);
    process.exit(1);
  }
  const target = join(values.project ? resolve('.') : homedir(), ...(values.project ? spec.project : spec.user), 'flow-tower');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(pkgRoot, 'skills', 'flow-tower'), target, { recursive: true });
  // The package is not on npm: bake the absolute CLI path into the installed skill,
  // and ship the procedure next to it so its links work outside the repo.
  const skillFile = join(target, 'SKILL.md');
  writeFileSync(
    skillFile,
    readFileSync(skillFile, 'utf8')
      .replaceAll('{{FLOW_TOWER_CLI}}', `node ${join(pkgRoot, 'bin', 'flow-tower.js')}`)
      .replaceAll('](../../docs/generate-a-tower.md)', '](procedure.md)'),
  );
  writeFileSync(join(target, 'procedure.md'), procedure().replaceAll(`](${join(pkgRoot, 'skills', 'flow-tower', 'reference.md')})`, '](reference.md)'));
  console.log(`installed the flow-tower skill for ${values.target} in ${target}\n${spec.note}`);
  process.exit(0);
}

/**
 * Sends one event to a running flow-tower: a raw payload from stdin (hooks), or one built from flags.
 * Never fails and never blocks for long: observability must not break the agent it observes.
 */
async function emit() {
  const query = values.source ? `?source=${encodeURIComponent(values.source)}` : '';
  const headers = { 'content-type': 'application/json' };
  if (env.FLOW_TOWER_TOKEN) headers['x-flow-tower-token'] = env.FLOW_TOWER_TOKEN;
  const post = (events) => fetch(`${values.url}/api/events${query}`, {
    method: 'POST', headers, body: JSON.stringify(events), signal: AbortSignal.timeout(1500),
  }).catch(() => {});

  if (values.kind) {
    const { kind, source = 'custom', agent, tool, node, tower, status, message } = values;
    await post([{ kind, source, agent, tool, node, tower, status, message }]);
  } else if (!process.stdin.isTTY) {
    await streamStdin(post);
  }
}

/**
 * Reads events from stdin. JSONL streams (codex exec --json, pi --mode json) are forwarded live,
 * in small batches every 250 ms; a single (possibly pretty-printed) JSON document is sent at the end.
 */
async function streamStdin(post) {
  let buffer = '';
  let mode; // 'lines' once a line parses on its own, 'whole' for a multi-line document
  let pending = [];
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    await post(batch);
  };
  const timer = setInterval(() => void flush(), 250);
  for await (const chunk of process.stdin) {
    buffer += chunk.toString('utf8');
    if (mode === 'whole') continue;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      let event;
      try { event = line ? JSON.parse(line) : undefined; } catch { event = null; }
      if (event === null && mode !== 'lines') { mode = 'whole'; break; }
      buffer = buffer.slice(nl + 1);
      if (event) { mode = 'lines'; pending.push(event); }
    }
  }
  clearInterval(timer);
  try {
    const tail = buffer.trim() ? JSON.parse(buffer.trim()) : [];
    pending.push(...(Array.isArray(tail) ? tail : [tail]));
  } catch { /* not JSON: ignore, never fail the caller */ }
  await flush();
}

if (positionals[0] === 'init') {
  const target = resolve(positionals[1] ?? 'agent.tower.yaml');
  if (existsSync(target)) {
    console.error(`refusing to overwrite ${target}`);
    process.exit(1);
  }
  writeFileSync(target, STARTER);
  console.log(`created ${target}\nnext: flow-tower ${positionals[1] ?? 'agent.tower.yaml'}`);
  process.exit(0);
}

const entries = positionals.map((p) => resolve(p));
const missing = entries.filter((e) => !existsSync(e));
if (missing.length) {
  console.error(`not found: ${missing.join(', ')}`);
  process.exit(1);
}

// The vite plugin reads its entries from the environment of this process.
env.FLOW_TOWER_ENTRIES = JSON.stringify(entries);
const { createServer } = await import('vite');
const server = await createServer({
  root: pkgRoot,
  configFile: join(pkgRoot, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port: Number(values.port), open: !values['no-open'] },
});
await server.listen();
console.log(`\n  FLOW//TOWER  ${entries.join('  ')}\n`);
server.printUrls();
