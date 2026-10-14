#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { hostname, homedir, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';
import { parseArgs } from 'node:util';
import { senderConfig } from './config-file.js';
import { withStreamSession } from './stream-context.js';
import { localServerUrl, recordLocalServer } from './local-server.js';
import { findTsCommand, runTsCommand } from './commands.js';
import { STARTER } from './starter.js';
import { clipIdentity, identityDefaults } from './identity.js';
import { cliName, shellPath } from './cli-name.js';
import { EMPTY_LIBRARY, libraryEntries, warnInCheckout } from './library.js';
import { serveConfig } from './vite-config.js';

const HELP = `flow-tower — 3D tower visualizer for agentic systems

Usage
  flow-tower <file.tower.yaml | dir> [more files or dirs...] [--port 5317] [--no-open | --browser <app>]
  flow-tower serve [...] [--hub] [--host <addr>] [--allowed-host <name>] [--ingest-only]
  flow-tower init [file.tower.yaml]
  flow-tower emit --source <claude-code|codex|pi|hermes> [--tower t] < payload.json  (hooks; JSONL streams live)
  flow-tower emit --kind <kind> [--agent a] [--tool t] [--node layer.node] [--tower t] [--status ok|error] [-m text]
                     [--user u] [--machine m] [--runtime r] [--session s] [--project-name p]
  flow-tower validate <file.tower.yaml | dir>... [--json]
  flow-tower copy <example> [dest] | --list          copy an examples/ tower into a new folder (default ./<name>) and validate it
  flow-tower check-example <dir> [--json]            pre-flight an example folder before proposing it: validate
                                                        clean, self-contained, README with Sources, no personal data
  flow-tower token add <id> | list | revoke <id> | pause <id> | resume <id>
                                                        per-sender hub tokens stored under the user folder
  flow-tower config path | show                         the config files in use, and the effective settings
                                                        (hub + emit in one config.json under the user folder)
  flow-tower library add <path>... | list | remove <path>
                                                        your own towers: a list of paths in the user folder's
                                                        config.json, outside the flow-tower checkout
  flow-tower library [--with-examples] [--port N]       serve your library, plus the checkout's examples
                                                        with --with-examples (other serve flags apply too)
  flow-tower connect <hub-url> [--token <t>] [--machine <name>] [--user <name>]
                                                        make this machine a satellite: writes role satellite into
                                                        the user folder's config.json, then sends one heartbeat
  flow-tower share <dir> [--files] [--name <name>] | --list
                                                        give a tower folder to the hub (satellite): YAML only, or with
                                                        --files also the files the towers reference; --list shows them
  flow-tower unshare <name|dir> [--force]               take a shared folder back from the hub; --force drops it from
                                                        config only when the hub cannot be reached
  flow-tower history export [--user <u>] | delete --user <u> | info
                                                        content-free events and totals in the user folder:
                                                        export prints JSONL, delete erases one user's rows
  flow-tower export <file.tower.yaml | dir> --pdf [--level 1|2|3|4] [--out <file.pdf>] [--port N]
                                                        the tower's document as a PDF, from headless Chromium;
                                                        every check must pass or no file is written (needs a browser:
                                                        npx playwright install chromium)
  flow-tower report <type> <input.yaml|json> [--source <file>]... [--drafts <drafts.json>] [--out <file.pdf>] [--html <file.html>]
                                                        a report (security-assessment, project-status, postmortem,
                                                        cost-review) as a PDF from headless Chromium; every blocking
                                                        check must pass or no file is written. --html alone needs no
                                                        browser (a PDF needs: npx playwright install chromium).
                                                        --list prints the types and their required sections
  flow-tower guide                                      print the procedure to generate a tower from a codebase
  flow-tower install-skill [--target <t>] [--project]   install the skills for your coding agent
                                                        <t>: claude (default), codex, pi, hermes, cursor, agents
  flow-tower hooks install [--target <t>] [--project] [--port N] [--dry-run]
                                                        wire the coding agents on this machine to send events here
                                                        (claude-code, codex, pi, hermes, or all; no --target: every one found)
  flow-tower hooks status
                                                        show where the hooks are wired, every harness, user and project level
  flow-tower hooks uninstall [--target <t>] [--project] [--dry-run]
                                                        remove only flow-tower's entries
  flow-tower service install | status | uninstall [--port N]
                                                        run the library as a user service (systemd on Linux, launchd on
                                                        macOS) so hooks always reach it and no event is lost

  Directories are scanned recursively for *.tower.yaml. Several projects open as a library.
  Live events: POST JSON to http://127.0.0.1:<port>/api/events (see docs/realtime.md).

Options
  -p, --port     Port to listen on (default 5317)
      --no-open  Do not open the browser
      --browser  Open this browser instead of the default (firefox, "google chrome", safari...; also $BROWSER)
      --hub      Hub mode: a shared server (also FLOW_TOWER_HUB=1). Remote requests may only ingest events
                 with a per-sender token (flow-tower token add <id>); the UI needs a listed viewer.
      --host     Bind address (default 127.0.0.1). A non-loopback address requires --hub.
      --ingest-only  Serve nothing but the ingest routes, even locally (also FLOW_TOWER_INGEST_ONLY=1);
                 every request needs a token like --hub (the command exits 1 without one)
      --allowed-host Name the Vite server accepts in Host, e.g. hub.tailnet-xyz.ts.net (repeatable; needed
                 when tailscale serve or a proxy forwards with its own Host; also FLOW_TOWER_ALLOWED_HOSTS, comma list).
                 Reaching the server through a proxy means hub mode: requires --hub
      --no-update-check  Do not ask GitHub once a day whether a newer release exists
                 (also FLOW_TOWER_NO_UPDATE_CHECK=1; always off in CI)
      --url      emit: server URL (default: the local server this user folder started, else http://127.0.0.1:5317;
                 a satellite with no live local server posts to its hub url instead, never to 5317);
                 a second server runs on another --port
                 user and machine are added by default only for a loopback URL (127.0.0.1, ::1, localhost):
                 to any other host they are sent only when given explicitly (--user/--machine, or
                 FLOW_TOWER_USER / FLOW_TOWER_MACHINE set to a non-empty value). FLOW_TOWER_USER=''
                 disables the user default everywhere.
      --tower    emit: only match towers whose id or name contains this (two versions in one library)
  -h, --help     Show this help
  -v, --version  Print the version and exit`;

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

/**
 * Rewrites the links of an installed skill so they keep working outside this repo.
 * `../flow-tower/...` points at the sibling skill, which install-skill copies next to this one: it stays.
 * `../../<path>` (docs/…, examples/…) only exists in the checkout, which is not shipped: point at it
 * absolutely, keeping any `#anchor`.
 */
function absolutizeOutboundLinks(md) {
  return md.replace(/\]\(\.\.\/\.\.\/([^)\s]+)\)/g, (_, rel) => `](${join(pkgRoot, rel)})`);
}

/** docs/generate-a-tower.md with the checkout path filled in and relative links made absolute. */
function procedure() {
  const docs = join(pkgRoot, 'docs');
  return readFileSync(join(docs, 'generate-a-tower.md'), 'utf8')
    .replaceAll('<flow-tower>/', `${pkgRoot}/`)
    // Once the path is filled in, "where `<flow-tower>` is the absolute path" would read as a
    // placeholder to fill again: say which checkout the commands use instead.
    .replace(/Commands below are written as `node [^`]*`, where `[^`]*` is the absolute path of a flow-tower checkout\./, () => `Commands below use this checkout: node ${shellPath(join(pkgRoot, 'bin', 'flow-tower.js'))}.`)
    .replace(/\]\((?!https?:|#|\/)([^)\s]+)\)/g, (_, rel) => `](${resolve(docs, rel)})`);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p', default: '5317' },
    'no-open': { type: 'boolean', default: false },
    browser: { type: 'string' },
    'no-update-check': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    // Hub mode (#83): `--host` is the bind address (identity's --machine maps to host, see below).
    hub: { type: 'boolean', default: false },
    host: { type: 'string' },
    'ingest-only': { type: 'boolean', default: false },
    'allowed-host': { type: 'string', multiple: true },
    // emit
    // No default here: emit picks the local server this user folder started (#187), else 5317 (see emit).
    url: { type: 'string' },
    source: { type: 'string' },
    kind: { type: 'string' },
    agent: { type: 'string' },
    tool: { type: 'string' },
    node: { type: 'string' },
    tower: { type: 'string' },
    status: { type: 'string' },
    message: { type: 'string', short: 'm' },
    // Identity (#82): who/where/what on every event. `--machine` maps to host, `--project-name` to project:
    // `--host` is reserved for the bind address (#83) and `--project` is install-skill's boolean.
    user: { type: 'string' },
    machine: { type: 'string' },
    token: { type: 'string' },
    runtime: { type: 'string' },
    session: { type: 'string' },
    'project-name': { type: 'string' },
    json: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    'with-examples': { type: 'boolean', default: false },
    // export: the PDF of a tower's document (src/cli/export.ts); the options are re-appended in commands.js.
    pdf: { type: 'boolean', default: false },
    level: { type: 'string' },
    out: { type: 'string' },
    // report: the document from a model-free input (src/cli/report.ts); --drafts and --html are re-appended in commands.js.
    drafts: { type: 'string' },
    html: { type: 'string' },
    // share / unshare (#164): --name is the hub folder's name, --files adds the referenced files, --force unshares offline.
    name: { type: 'string' },
    files: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    project: { type: 'boolean', default: false },
    target: { type: 'string', default: 'claude' },
    // hooks (src/cli/hooks.ts): --dry-run writes nothing; --target, --project and --port are re-appended in commands.js.
    'dry-run': { type: 'boolean', default: false },
  },
});

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Before the help check: `--version` has no positionals, so it would otherwise print help and exit 1.
// Read from this package's own package.json, not the cwd, so it names the checkout that is running.
if (values.version) {
  console.log(JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version);
  process.exit(0);
}

if (values.help || positionals.length === 0) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}

/** Was this flag actually on the command line? parseArgs' defaults cannot tell a flag from its default. */
const explicit = (name) => process.argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

/**
 * The effective settings from src/server/config.ts (#90), printed as JSON by its own CLI so the flags >
 * environment > config precedence lives in one place. Serve reads no token from here: the config's token
 * is the sender credential, so `json` always redacts it; a failure to run it yields {} and the defaults.
 */
function configJson(flags = []) {
  const script = join(pkgRoot, 'src', 'cli', 'config.ts');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', script, 'json', ...flags], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return {}; }
}

if (positionals[0] === 'emit') {
  await emit();
  process.exit(0);
}

// The TypeScript subcommands (config, validate, copy, check-example, token, history, connect, library add|list|remove)
// are table-driven in commands.js; the options parseArgs strips are appended back there.
const tsCommand = findTsCommand(positionals);
if (tsCommand) process.exit(runTsCommand(pkgRoot, tsCommand, positionals, values));

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
  const skills = values.project ? spec.project : spec.user;
  const base = values.project ? resolve('.') : homedir();
  const target = join(base, ...skills, 'flow-tower');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(pkgRoot, 'skills', 'flow-tower'), target, { recursive: true });
  // The package is not on npm: bake the absolute CLI path into the installed skill,
  // and ship the procedure next to it so its links work outside the repo.
  const cli = `node ${join(pkgRoot, 'bin', 'flow-tower.js')}`;
  const skillFile = join(target, 'SKILL.md');
  writeFileSync(
    skillFile,
    readFileSync(skillFile, 'utf8')
      .replaceAll('{{FLOW_TOWER_CLI}}', cli)
      .replaceAll('](../../docs/generate-a-tower.md)', '](procedure.md)'),
  );
  writeFileSync(join(target, 'procedure.md'), procedure().replaceAll(`](${join(pkgRoot, 'skills', 'flow-tower', 'reference.md')})`, '](reference.md)'));

  // Install the other skills next to flow-tower: their `../flow-tower/...` links then resolve as is.
  const others = ['flow-tower-costs', 'flow-tower-use-example', 'flow-tower-contribute', 'flow-tower-my-library', 'flow-tower-command-center', 'flow-tower-satellite', 'flow-tower-report', 'flow-tower-optimize'].map((name) => join(base, ...skills, name));
  for (const dir of others) {
    cpSync(join(pkgRoot, 'skills', basename(dir)), dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const file = join(dir, f);
      writeFileSync(file, absolutizeOutboundLinks(readFileSync(file, 'utf8').replaceAll('{{FLOW_TOWER_CLI}}', cli)));
    }
  }
  console.log(`installed the flow-tower skills for ${values.target}:\n  ${[target, ...others].join('\n  ')}\n${spec.note}`);
  process.exit(0);
}

/**
 * Sends one event to a running flow-tower: a raw payload from stdin (hooks), or one built from flags.
 * Never fails and never blocks for long: observability must not break the agent it observes.
 */
async function emit() {
  // url/user/machine/token default from the config file (#90); flags and env still win. Read in plain JS:
  // emit runs on every hook call, so it must not start a second Node (bin/config-file.js).
  const cfg = senderConfig({
    env, checkout: pkgRoot,
    flags: { url: explicit('url') ? values.url : undefined, user: values.user, machine: values.machine, token: values.token },
  });
  // An explicit --url always wins. Otherwise the server this user folder started (#187) is the local default,
  // so a server on another port needs no flag; the fixed 5317 is only the fallback when no live server is recorded.
  // A satellite (#91) posts to the LOCAL relay when one is recorded as live, and otherwise straight to the hub
  // the config names: with no live record, 5317 may be another server's port, so it is never a satellite's target.
  // The local relay carries the hub token itself, so the config token is not sent there (it would only earn a 401).
  const liveLocal = localServerUrl({ env });
  const url = explicit('url') ? values.url
    : cfg.role === 'satellite' ? liveLocal ?? cfg.config.url
      : cfg.url ?? liveLocal ?? 'http://127.0.0.1:5317';
  // A satellite with neither a live relay nor a hub url has nowhere correct to post: post nothing, never guess.
  if (!url) return;

  const params = new URLSearchParams(Object.entries({ source: values.source, tower: values.tower }).filter(([, v]) => v));
  const query = params.size ? `?${params}` : '';
  const headers = { 'content-type': 'application/json' };
  // Explicit credentials travel everywhere; the CONFIG token is the hub's credential for the config url,
  // so it is only ever attached to that url's origin and never handed to a different host via --url.
  const sameOrigin = (a, b) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };
  const envToken = env.FLOW_TOWER_TOKEN?.trim();
  const configToken = cfg.config.token && cfg.config.url && sameOrigin(cfg.config.url, url) ? cfg.config.token : undefined;
  const explicitToken = values.token ?? (envToken || undefined);
  const token = explicitToken ?? configToken;
  if (token) headers['x-flow-tower-token'] = token;
  // Posts to one url. Resolves to true when the request was refused at the connection (ECONNREFUSED or
  // a socket error before any reply), so the caller can fall back; an HTTP answer of any status is a reply.
  // Only ECONNREFUSED counts: a timeout or a DNS failure may mean the event did arrive, so it is not re-sent.
  const send = (target, events, sendHeaders) => fetch(`${target}/api/events${query}`, {
    method: 'POST', headers: sendHeaders, body: JSON.stringify(events), signal: AbortSignal.timeout(1500),
  }).then(() => false, (err) => err?.cause?.code === 'ECONNREFUSED');
  // A satellite's local server is the relay: when nothing listens there (the library was never started, or
  // it stopped), the event would be lost. Fall back once to the hub the config names, with the config token
  // (same origin as that url, so the token rule holds). HTTP hooks of Claude Code, Codex and the rest cannot
  // fall back: they are not our code and post to the local server directly, so `service install` is the fix.
  // Only a satellite that posted to a live local relay has a hub to fall back to; posting straight to the hub has none.
  const hubFallback = cfg.role === 'satellite' && !explicit('url') && liveLocal && cfg.config.url && cfg.config.token && url !== cfg.config.url;
  // An explicit token was given for this call, so it wins the fallback too; the config token is only the default.
  const hubHeaders = { ...headers, 'x-flow-tower-token': explicitToken ?? cfg.config.token };
  const post = async (events) => {
    if (!(await send(url, events, headers)) || !hubFallback) return;
    await send(cfg.config.url, events, hubHeaders);
  };

  // Defaults so identity is never empty on a loopback target; a payload or an explicit flag always wins (#82).
  // The config's user/machine are explicit (like a flag), so the loopback rule only guards the os fallback.
  const defaults = identityDefaults(url, env, { username: userInfo().username, hostname: hostname() }, cfg);
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const withIdentity = (event) => clipIdentity({ ...defaults, ...clean(event), ...clean(identity) });
  const identity = {
    user: values.user, host: values.machine, runtime: values.runtime, session: values.session, project: values['project-name'],
  };

  if (values.kind) {
    const { kind, source = 'custom', agent, tool, node, tower, status, message } = values;
    await post([withIdentity({ ...identity, kind, source, agent, tool, node, tower, status, message })]);
  } else if (!process.stdin.isTTY) {
    await streamStdin(values.source, (events) => post(events.map(withIdentity)));
  }
}

/**
 * Reads events from stdin. JSONL streams (codex exec --json, pi --mode json) are forwarded live,
 * in small batches every 250 ms; a single (possibly pretty-printed) JSON document is sent at the end.
 */
async function streamStdin(source, post) {
  let buffer = '';
  let mode; // 'lines' once a line parses on its own, 'whole' for a multi-line document
  let pending = [];
  // One session memory per stream: a line from another stream must not inherit this one's session.
  const streamState = {};
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
      if (event) { mode = 'lines'; pending.push(withStreamSession(source, event, streamState)); }
    }
  }
  clearInterval(timer);
  try {
    const tail = buffer.trim() ? JSON.parse(buffer.trim()) : [];
    pending.push(...(Array.isArray(tail) ? tail : [tail]).map((e) => withStreamSession(source, e, streamState)));
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
  console.log(`created ${target}\nnext: ${cliName()} ${positionals[1] ?? 'agent.tower.yaml'}`);
  process.exit(0);
}

/**
 * The entries to serve. `serve` and a bare file/dir list are command-line paths; a bare `library`
 * (its subcommands exited above) is the user's own list, with `mine` kept to badge them in the UI.
 */
let mine;
let entries;
if (positionals[0] === 'serve') {
  entries = positionals.slice(1).map((p) => resolve(p));
} else if (positionals[0] === 'library') {
  ({ mine, entries } = libraryEntries({ env, checkout: pkgRoot, withExamples: values['with-examples'] }));
  if (!entries.length) {
    console.error(EMPTY_LIBRARY);
    process.exit(1);
  }
} else {
  entries = positionals.map((p) => resolve(p));
}
const missing = entries.filter((e) => !existsSync(e));
if (missing.length) {
  console.error(`not found: ${missing.join(', ')}`);
  process.exit(1);
}
// One warning per entry kept inside the flow-tower checkout: it is one commit away from the repo, and
// `library add` refuses nothing for it, so the user only learns here.
warnInCheckout({ checkout: pkgRoot, entries });

/**
 * Hub mode (#83): the server may be reached from off this machine. Ingest then needs a token, viewing
 * needs the tailnet user in config.json (or the legacy hub.json), everything else is refused (src/server/hub.ts).
 * hub/host/allowedHosts/ingestOnly default from the config file (#90); the flags still win. The token
 * does not: see below.
 */
const isLoopbackHost = (h) => h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
const serveFlags = [];
if (values.hub) serveFlags.push('--hub');
if (values.host !== undefined) serveFlags.push('--host', values.host);
for (const h of values['allowed-host'] ?? []) serveFlags.push('--allowed-host', h);
if (values['ingest-only']) serveFlags.push('--ingest-only');
const cfg = configJson(serveFlags);
const hub = cfg.hub ?? values.hub;
const ingestOnly = cfg.ingestOnly ?? values['ingest-only'];
const bindHost = cfg.host ?? values.host ?? '127.0.0.1';

if (!hub && !isLoopbackHost(bindHost)) {
  console.error(`refusing to bind ${bindHost} without --hub: only loopback may run unguarded.
To serve a shared hub, run: ${cliName()} <files> --hub --host ${bindHost}`);
  process.exit(1);
}
// An allowed host is only reachable through a proxy (Tailscale serve, Caddy): that is a hub, not a local server.
const allowedHosts = cfg.allowedHosts ?? [];
if (!hub && allowedHosts.length) {
  console.error(`an allowed host means the server is reachable through a proxy: add --hub (and a token)`);
  process.exit(1);
}
// The config's token is this machine's credential for the hub it SENDS to (emit, the satellite relay):
// it is never a secret guarding this server, or a revoked/paused token pasted into config.json would
// still authenticate here. This server's shared secret stays FLOW_TOWER_TOKEN; per-sender tokens live
// in tokens.json. So the "needs a token" refusal ignores the config file.
const token = env.FLOW_TOWER_TOKEN;
// A tailnet hub with viewers can start with no token yet: `connect` enrols each viewer's machine and the
// hub mints its token then (#164). Until one exists the hub still accepts no event, so nothing is unsigned.
const canEnrol = hub && !ingestOnly && (cfg.viewers ?? []).length > 0;
if ((hub || ingestOnly) && !token && !canEnrol && !hasActiveToken()) {
  console.error(`${hub ? 'hub mode' : '--ingest-only'} needs a token to accept any event.
create one: ${cliName()} token add <id>\nThen send it as x-flow-tower-token (or FLOW_TOWER_TOKEN for a shared secret).`);
  process.exit(1);
}

/** True when a per-sender token is active: the store is TypeScript, so ask its own CLI (as `token` does). */
function hasActiveToken() {
  const script = join(pkgRoot, 'src', 'cli', 'token.ts');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', script, 'list'], { encoding: 'utf8' });
  return /\bactive\b/.test(r.stdout ?? '');
}

// The kit's example domains left in the settings (#193): named once at start, so a copied config is not served as is.
const placeholders = cfg.placeholders ?? [];
if (placeholders.length) {
  console.error(`warning: config.json still has the kit's placeholder ${placeholders.join(', ')}: set your own or remove it`);
}

// The vite plugin reads its entries (and the update-check opt-out) from the environment of this process.
env.FLOW_TOWER_ENTRIES = JSON.stringify(entries);
// A library serve marks itself and names the user's own paths, so the UI can tell them from examples.
if (mine !== undefined) {
  env.FLOW_TOWER_LIBRARY = '1';
  env.FLOW_TOWER_MINE = JSON.stringify(mine);
}
if (values['no-update-check']) env.FLOW_TOWER_NO_UPDATE_CHECK = '1';
// The resolved hub settings go out as the same env vars as today, so src/server/hub.ts keeps one path.
if (hub) env.FLOW_TOWER_HUB = '1';
if (ingestOnly) env.FLOW_TOWER_INGEST_ONLY = '1';
// FLOW_TOWER_TOKEN is passed on unchanged: serve never rewrites it from the config's sender token.
// Vite opens the page with the `open` package, which reads $BROWSER.
if (values.browser) env.BROWSER = values.browser;
const { createServer } = await import('vite');
const server = await createServer(await serveConfig(pkgRoot, {
  root: pkgRoot,
  // One dependency cache per port: two servers from this checkout (a second --port, or the e2e server) would
  // otherwise re-optimize the same files under each other, and an open page fails to load renamed chunks.
  cacheDir: join(pkgRoot, 'node_modules', '.vite', `port-${values.port}`),
  logLevel: 'warn',
  server: {
    port: Number(values.port),
    // Never fall back to another port: the cacheDir below and the URL the user opens both assume this one (#136).
    strictPort: true,
    host: bindHost,
    open: !values['no-open'],
    // Only when the user named hosts: an explicit list must not replace Vite's localhost/IP defaults for nothing.
    ...(allowedHosts.length ? { allowedHosts } : {}),
  },
}));
try {
  await server.listen();
} catch (err) {
  // The user opens exactly this port (and its own cache dir): a silent bump would show someone else's server.
  // Vite's strictPort rejection drops the EADDRINUSE code, so its message has to count as busy too.
  if (err?.code === 'EADDRINUSE' || /is already in use/.test(err?.message ?? '')) {
    console.error(`port ${values.port} is in use: another server runs there (maybe another flow-tower). Use --port ${Number(values.port) + 1}, or stop it.`);
    await server.close();
    process.exit(1);
  }
  throw err;
}
// Record where this server listens (#187), so emit and simulate in this user folder find it without --url.
recordLocalServer({ env, bindHost, port: values.port });
// Show the URL in the banner too: with strictPort it is always the port the user asked for.
console.log(`\n  FLOW//TOWER  http://${bindHost}:${values.port}  ${entries.join('  ')}${hub ? '  [hub]' : ''}${ingestOnly ? '  [ingest-only]' : ''}\n`);
server.printUrls();
