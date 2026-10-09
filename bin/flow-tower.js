#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';
import { parseArgs } from 'node:util';

const HELP = `flow-tower — 3D tower visualizer for agentic systems

Usage
  flow-tower <file.tower.yaml | dir> [more files or dirs...] [--port 5317] [--no-open]
  flow-tower init [file.tower.yaml]
  flow-tower emit --source <claude-code|pi|hermes>      < payload.json   (from agent hooks)
  flow-tower emit --kind <kind> [--agent a] [--tool t] [--node layer.node] [-m text]

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

/**
 * Sends one event to a running flow-tower: a raw payload from stdin (hooks), or one built from flags.
 * Never fails and never blocks for long: observability must not break the agent it observes.
 */
async function emit() {
  let body;
  if (values.kind) {
    const { kind, source = 'custom', agent, tool, node, tower, status, message } = values;
    body = JSON.stringify({ kind, source, agent, tool, node, tower, status, message });
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    body = Buffer.concat(chunks).toString('utf8').trim();
  }
  if (!body) return;
  const query = values.source ? `?source=${encodeURIComponent(values.source)}` : '';
  const headers = { 'content-type': 'application/json' };
  if (env.FLOW_TOWER_TOKEN) headers['x-flow-tower-token'] = env.FLOW_TOWER_TOKEN;
  // Line-delimited streams (pi --mode json) are sent as one array.
  const payload = body.startsWith('{') && body.includes('\n{') ? `[${body.split('\n').filter(Boolean).join(',')}]` : body;
  await fetch(`${values.url}/api/events${query}`, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(1500) })
    .catch(() => {});
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
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
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
