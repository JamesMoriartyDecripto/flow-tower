import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, loadEnvFile } from 'node:process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Plugin, ViteDevServer } from 'vite';
import { loadLibrary, type LoadResult } from '../core/loader.ts';
import { readTowerFile } from './files.ts';
import { createEventHub, EVENTS_EVENT } from './events.ts';
import { createSatellites } from './satellites.ts';
import { checkForUpdate, updateCheckDisabled, versionPayload, UPDATE_COMMAND, type UpdateInfo } from './update.ts';
import { versionCheckHandler } from './version-check.ts';
import { VOICE_DEFAULTS, voiceHandler } from './voice.ts';
import { voiceStore } from './voice-memory.ts';
import { userHome, warnIfInRepo } from './home.ts';
import { libraryOrigins, minePaths } from './origins.ts';
import { projectSharedAt, projectSources, sharedProjectOf } from './sources.ts';
import { crossSite } from './guard.ts';
import { stopOnClose } from './lifecycle.ts';
import { isLoopbackUrl } from '../../bin/identity.js';
import { isRemote } from './auth.ts';
import { createRelay } from './relay.ts';
import { sharingHandler } from './sharing.ts';
import { startShareSync } from './share-sync.ts';
import { createRelaySupervisor, type RelayReading } from './relay-supervisor.ts';
import { effective, loadConfig } from './config.ts';
import { allowUpgrade, hubGuard, hubOptionsFromEnv } from './hub.ts';
import { hubViews } from './hub-views.ts';
import { hubAlerts, startAlertNotifier } from './hub-alerts.ts';
import { hubAdmin } from './hub-admin.ts';
import { enrollHandler } from './enroll.ts';
import { relaxSharedIssues, sharedTowersHandler } from './shared-towers.ts';
import { openHistory } from './history/db.ts';
import { createHistory } from './history/store.ts';
import { historyHandler } from './history/api.ts';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = (JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
// The user's own things (OPENROUTER_API_KEY, voice journal and memory) live in their config folder, not in
// the repo: ~/.config/flow-tower (or FLOW_TOWER_HOME). The git-ignored .env in the flow-tower folder is still
// read as a fallback. Real environment variables win, then the user folder, then the repo folder.
export const USER_HOME = userHome();
warnIfInRepo(PKG_ROOT);
for (const file of [join(USER_HOME, '.env'), join(PKG_ROOT, '.env')]) if (existsSync(file)) loadEnvFile(file);

export const UPDATE_EVENT = 'flow-tower:update';

/** Set once a history write has failed: one warning per process is enough to tell the user. */
let historyWarned = false;
const warnHistoryOnce = (server: ViteDevServer, err: unknown) => {
  if (historyWarned) return;
  historyWarned = true;
  const reason = err instanceof Error ? err.message : String(err);
  server.config.logger.warn(`flow-tower: history write failed (${reason}); ingest keeps running, history may be incomplete`);
};

/** Serves the resolved library + referenced files, and pushes live updates on change. */
export function flowTower(entries: string[] = JSON.parse(env.FLOW_TOWER_ENTRIES ?? '[]')): Plugin {
  let state: LoadResult | undefined;
  let timer: NodeJS.Timeout | undefined;
  // The hub's library folder (#164): the first entry that is a directory. Shared towers are written there, and
  // the sources of the projects are read against it (#165), so both use this one value.
  const library = entries.map((e) => resolve(e)).find((p) => isDirectory(p));
  // chokidar keeps one listener per add() call even for paths it already watches: add only new ones.
  const watching = new Set<string>();
  const watch = (server: ViteDevServer, paths: string[]) => {
    const fresh = paths.filter((p) => !watching.has(p));
    fresh.forEach((p) => watching.add(p));
    if (fresh.length) server.watcher.add(fresh);
  };

  const reload = async (server?: ViteDevServer) => {
    if (!entries.length) return;
    // A shared tower reads only its own share folder, never the checkout around the library (#190).
    state = await loadLibrary(entries, { projectOf: (file) => sharedProjectOf(file, library) });
    // A `flow-tower library` serve marks origins (#121c); any other serve (dev, demo) leaves it undefined.
    if (env.FLOW_TOWER_LIBRARY === '1') {
      state.workspace.origins = libraryOrigins(entries, state.workspace.projects, { checkout: PKG_ROOT, mine: minePaths(env.FLOW_TOWER_MINE) });
    }
    // Every serve, not only a library one: a hub shows which machine each shared tower came from (#165).
    const loaded = state;
    const projects = loaded.workspace.projects.flatMap((id) => { const file = loaded.files.get(id); return file ? [{ id, file }] : []; });
    loaded.workspace.sources = projectSources(projects, library);
    loaded.workspace.sharedAt = projectSharedAt(projects, library);
    // A shared tower's files stay on the machine that shared it, so the hub cannot read them: those errors
    // are relaxed to info here. Only the project's own tower is touched; its issues get a fresh array.
    for (const [id, machine] of Object.entries(loaded.workspace.sources ?? {})) {
      const tower = loaded.workspace.towers[id];
      if (machine !== 'local' && tower) tower.issues = relaxSharedIssues(tower.issues, machine);
    }
    if (server) {
      watch(server, [...state.watched, ...existingDirs(state.missing)]);
      server.ws.send(UPDATE_EVENT, { loadedAt: state.workspace.loadedAt });
    }
  };

  return {
    name: 'flow-tower',
    async configureServer(server) {
      await reload();
      if (state) watch(server, [...state.watched, ...existingDirs(state.missing), ...entries.map((e) => resolve(e))]);
      // A tower file added to or removed from a watched directory changes the library too.
      const onFsEvent = (file: string) => {
        if (!state?.watched.has(file) && !state?.missing.has(file) && !file.endsWith('.tower.yaml')) return;
        clearTimeout(timer);
        timer = setTimeout(() => void reload(server), 120);
      };
      server.watcher.on('change', onFsEvent);
      server.watcher.on('add', onFsEvent);
      server.watcher.on('unlink', onFsEvent);

      // Hub mode (#83) goes first, before any route: a remote request is checked from the socket and the
      // proxy headers alone, so no endpoint is reached (not even the static UI) before that decision.
      const hubOpts = hubOptionsFromEnv();
      if (hubOpts.hub || hubOpts.ingestOnly) server.middlewares.use(hubGuard(hubOpts));

      // WebSocket upgrades (#83) never reach the middlewares: Vite answers HMR/ws itself on the http
      // server's 'upgrade' event. A remote stranger could open the socket and then receive the live event
      // broadcasts, so the same rule is enforced here. prependListener runs us before Vite's own handler:
      // without that, Vite would already have accepted the handshake for a request we mean to refuse.
      if (hubOpts.hub || hubOpts.ingestOnly) {
        server.httpServer?.prependListener('upgrade', (req: IncomingMessage, socket: Duplex) => {
          if (allowUpgrade(req, hubOpts)) return;
          socket.destroy();
        });
      }

      // Satellite relay (#91) and shared towers (#164): the supervisor owns both and re-reads the config every
      // few seconds, so `connect`, a new token or a role change takes effect with no restart. Every use below
      // asks it for the current relay instead of holding one, since the relay may appear or go later.
      // Per server, not per process: a Vite restart in the same process warns about a refusal again.
      const refusals = new Set<string>();
      const supervisor = createRelaySupervisor({
        read: () => readRelayConfig(server, hubOpts, refusals),
        build: (settings, onStateChange, shareErrors) => createRelay({ ...settings, version: VERSION, onStateChange, shareErrors }),
        startSync: (settings) => settings.token
          ? startShareSync({ home: USER_HOME, url: settings.url, token: settings.token, warn: (message) => server.config.logger.warn(message) })
          : undefined,
        // warn, not info: the CLI runs Vite at logLevel 'warn', and the user must see a connect or a refusal.
        log: (message) => server.config.logger.warn(message),
      });
      // The hub side of #91: heartbeats and accepted events keep this list fresh; the UI reads it below.
      const satellites = createSatellites();

      // Reads are for this page only: Vite's default CORS would let a page on another localhost port read them.
      server.middlewares.use('/api/workspace', (req, res) => {
        if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
        if (!state?.workspace.projects.length) return send(res, 404, { error: 'no tower files found: run `flow-tower <file.tower.yaml | dir>`' });
        send(res, 200, state.workspace);
      });
      server.middlewares.use('/api/file', (req, res) => void serveFile(req, res, state));

      // Sharing (#91): reads what a satellite is relaying, and the two local controls — pause and the
      // hub test. state() never carries the token; a local server answers { state: 'off' }.
      // connect() matches a mount by prefix, so /api/sharing would also receive /api/sharing/test (as
      // '/test') and answer it as a pause request. The test is mounted first, and each handler answers
      // only its own mount root (req.url '' or '/'), so neither can shadow the other.
      const sharing = sharingHandler({ home: USER_HOME, relay: () => supervisor.current(), sync: () => supervisor.sync(), hub: hubOpts.hub });
      server.middlewares.use('/api/sharing/test', sharing.test);
      server.middlewares.use('/api/sharing', sharing.control);

      // History (#84) lives in the user's folder, never the repo. An old Node without node:sqlite disables
      // it with one message: the live view keeps working, the hub simply gets no onAccepted.
      const opened = await openHistory(join(USER_HOME, 'history.db'));
      if ('disabled' in opened) server.config.logger.warn(`flow-tower: ${opened.disabled}`);
      const history = 'disabled' in opened ? undefined : createHistory(opened.db);
      let prune: NodeJS.Timeout | undefined;
      if (history) {
        // Retention policy (#84): prune once on start, then hourly. unref() so the timer never keeps the
        // dev server process alive on its own.
        history.prune();
        prune = setInterval(() => history.prune(), 3_600_000);
        prune.unref();
      }
      const hub = createEventHub(        () => state?.workspace,
        (events) => server.ws.send(EVENTS_EVENT, events),
        // The user folder holds the per-sender tokens (#83); FLOW_TOWER_TOKEN stays the shared legacy secret.
        { legacy: env.FLOW_TOWER_TOKEN, home: userHome(), hub: hubOpts.hub, ingestOnly: hubOpts.ingestOnly },
        // History must never break ingest: a full disk makes the INSERT throw, and the live view is what
        // matters. Warn once, then stay quiet so a broken DB cannot flood the log. The relay runs in its own
        // try/catch for the same reason: a dead hub must never cost us a local event.
        { onAccepted: (events) => {
          try { history?.write(events); } catch (err) { warnHistoryOnce(server, err); }
          try { supervisor.current()?.push(events); } catch { /* the relay must never break ingest or history */ }
        }, satellites, warn: (message) => server.config.logger.warn(message) },
      );
      // History reads (#84 phase 4): a viewing route like /api/workspace, so hub mode's remote-viewer
      // rule decides who sees it and crossSite keeps other pages on this machine out.
      const views = historyHandler(history);
      server.middlewares.use('/api/history/info', views.info);
      server.middlewares.use('/api/history', views.totals);

      server.middlewares.use('/api/events', hub.handle);
      server.middlewares.use('/api/heartbeat', hub.heartbeat);
      // The hub's satellite list (#91): a viewing route like /api/history, so hub mode's remote-viewer
      // rule decides who sees it. Never tokens, only what each satellite reported.
      server.middlewares.use('/api/hub/satellites', (req, res) => {
        if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
        send(res, 200, satellites.list());
      });
      // The Hub panel's own reads (#92): machines and me, GET viewing routes like satellites, so hub
      // mode's remote-viewer rule decides who sees them and crossSite keeps other local pages out.
      const hubPanel = hubViews({ satellites, home: USER_HOME, hub: hubOpts.hub });
      server.middlewares.use('/api/hub/machines', hubPanel.machines);
      server.middlewares.use('/api/hub/me', hubPanel.me);
      // Alerts (#94): one mount for the list and the ack and snooze POSTs. The list is a viewing route; the two
      // POSTs answer only this machine (see hub-alerts.ts). The history DB is passed in, undefined when disabled.
      const alertDb = 'db' in opened ? opened.db : undefined;
      server.middlewares.use('/api/hub/alerts', hubAlerts({ satellites, home: USER_HOME, hub: hubOpts.hub, db: alertDb }));
      // The webhook notifier (#191) runs on a hub only: it is the hub's alerts that a lead must hear about with no tab open.
      const notifier = hubOpts.hub ? startAlertNotifier({ satellites, home: USER_HOME, db: alertDb }) : undefined;
      // Admin (#93): the panel's sender, viewer, budget, alert, retention and history controls. Every route is
      // loopback-only (see hub-admin.ts); the GET is read with the same rule. Mounted by prefix, so the one
      // handler routes each sub-path itself.
      server.middlewares.use('/api/hub/admin', hubAdmin({ home: USER_HOME, hub: hubOpts.hub, history, hubUrl: () => hubUrlOf(server) }));
      // Enrolment (#164): a POST that hands a listed viewer its machine's token. No other /api/hub mount is a
      // prefix of it, so nothing else swallows it. The route itself refuses anything but a tailnet viewer.
      server.middlewares.use('/api/hub/enroll', enrollHandler({ home: USER_HOME, hub: hubOpts.hub }));
      // Shared towers (#164): a satellite uploads its folder here, signed with its token. The first library
      // entry that is a directory is where the hub writes it; none means the route answers 503.
      server.middlewares.use('/api/hub/towers', sharedTowersHandler({ library, home: USER_HOME, hub: hubOpts.hub, legacy: env.FLOW_TOWER_TOKEN }));
      // OpenTelemetry: point OTEL_EXPORTER_OTLP_ENDPOINT at this server (http/json), see docs/realtime.md.
      server.middlewares.use('/v1/logs', hub.otlp('logs'));
      server.middlewares.use('/v1/metrics', hub.otlp('metrics'));
      server.middlewares.use('/v1/traces', hub.otlp('traces'));

      // Update notice (#35): one quiet check per start, never blocking the server.
      let update: UpdateInfo = { current: VERSION, newer: false };
      const updateDisabled = updateCheckDisabled();
      if (!updateDisabled) {
        void checkForUpdate({ current: VERSION }).then((u) => {
          update = u;
          if (u.newer) server.config.logger.warn(`\n  ↑ Flow Tower ${u.latest} is available (you have v${VERSION}): ${u.url}${UPDATE_COMMAND ? `\n    update: ${UPDATE_COMMAND}` : ''}\n`);
        });
      }
      // Voice commands (#62): audio goes to OpenRouter only when OPENROUTER_API_KEY is set; the key stays here.
      server.middlewares.use('/api/voice', voiceHandler({
        key: env.OPENROUTER_API_KEY,
        model: env.FLOW_TOWER_VOICE_MODEL ?? VOICE_DEFAULTS.stt,
        chatModel: env.FLOW_TOWER_AGENT_MODEL,
        ttsModel: env.FLOW_TOWER_TTS_MODEL,
        voice: env.FLOW_TOWER_TTS_VOICE,
        zdr: env.FLOW_TOWER_VOICE_ZDR !== '0',
        // The journal lives in ~/.config/flow-tower; the page writes to it only when the user turned it on.
        learning: { store: voiceStore(USER_HOME), names: (ids) => namesOf(state, ids) },
      }));
      // Forced update check (#141): the top bar's "check now". connect matches a mount by prefix, so
      // `/api/version` would also receive `/api/version/check` (as '/check') and answer it as a plain GET;
      // mounting the check first keeps the two routes apart, like /api/sharing/test above.
      const versionCheck = versionCheckHandler({
        current: VERSION,
        hub: hubOpts.hub,
        disabled: updateDisabled,
        check: (args) => checkForUpdate(args),
        now: Date.now,
        set: (u) => { update = u; },
      });
      server.middlewares.use('/api/version/check', versionCheck);
      server.middlewares.use('/api/version', (req, res) => {
        // The update command embeds this checkout's absolute path: a remote viewer has no use for it.
        const remote = isRemote(req, { hub: hubOpts.hub });
        send(res, 200, { ...versionPayload(update, remote), disabled: updateDisabled });
      });

      // Everything this plugin started with a timer (the relay's flush/heartbeat, the history prune, the
      // reload debounce) stops with the dev server: a restart must not leave the old ones running (#91, #99).
      stopOnClose(server, [
        () => supervisor.stop(),
        () => { if (prune) clearInterval(prune); },
        () => clearTimeout(timer),
        () => notifier?.stop(),
      ]);
    },
  };
}

/**
 * What the relay supervisor reads on each tick (#91). A server that is itself a hub, or ingest-only behind a
 * proxy, must not relay: the hub would receive its own events. A url pointing back at this same server would
 * make the relay feed itself — a loop — so it is refused too. The refusal is warned once, not every tick.
 */
function readRelayConfig(server: ViteDevServer, hubOpts: { hub: boolean; ingestOnly: boolean }, refusals: Set<string>): RelayReading {
  const settings = effective(loadConfig().config);
  const base = { role: settings.role, url: settings.url, token: settings.token, user: settings.user, machine: settings.machine, paused: settings.paused };
  if (settings.role !== 'satellite' || !settings.url) return { ...base, allowed: false };
  if (hubOpts.hub || hubOpts.ingestOnly || settings.hub || settings.ingestOnly) {
    warnRefusalOnce(server, refusals, 'flow-tower: satellite relay refused: this server is a hub or ingest-only');
    return { ...base, allowed: false };
  }
  if (targetsSelf(settings.url, server)) {
    warnRefusalOnce(server, refusals, 'flow-tower: satellite relay refused: url points at this same server (would loop)');
    return { ...base, allowed: false };
  }
  return { ...base, allowed: true };
}

/**
 * One refusal line per distinct reason: the supervisor asks every few seconds, and the log must not fill up.
 * The set belongs to one server, so a restart (a new server object) warns again.
 */
function warnRefusalOnce(server: ViteDevServer, refusals: Set<string>, message: string) {
  if (refusals.has(message)) return;
  refusals.add(message);
  server.config.logger.warn(message);
}

/**
 * Loopback host on the port we bound to: relaying there would feed this server its own events. The
 * host check reuses the CLI's isLoopbackUrl, which strips IPv6 brackets and accepts `localhost` and
 * 127.x — a plain isLoopback() missed both and let a self-loop through.
 */
export function targetsSelf(url: string, server: ViteDevServer): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (!isLoopbackUrl(url)) return false;
  // The bound port is not in the Vite config: read it from the live http server, if it is already up.
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : server.config.server.port;
  // An empty port means the scheme default (80 for http, 443 for https), which can still be our port.
  const target = parsed.port !== '' ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  return target === port;
}

/**
 * The URL a sender should connect to, for the connect line the admin panel shows (#93). Taken from the
 * bound port; a hub behind tailscale serve is reached by its tailnet name, which is what `url` in config
 * carries, so that wins when it is set.
 */
export function hubUrlOf(server: ViteDevServer): string {
  const configured = effective(loadConfig().config).url;
  if (configured) return configured;
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : server.config.server.port;
  return `http://127.0.0.1:${port}`;
}

/** Re-exported for callers that only know this module: the payload itself lives with the update check. */
export { versionPayload };

/**
 * Stops what the plugin started when the dev server closes (#91, #99). Vite 8 restarts the server when a
 * src/server file or the config changes, and every restart closes the old http server: without this, the
 * old relay kept beating at the hub and its timers kept the whole previous server alive, so memory grew
 * across restarts (#99). A probe confirmed the old httpServer really emits 'close' on a restart (Vite
 * closes and re-creates the server), which is what makes this hook the right place to stop the old timers.
 * The relay's stop() and any interval the plugin started go through here; the httpServer is optional (it is
 * undefined before listen), so the wiring is a no-op then. Re-exported from lifecycle.ts, where it is tested
 * with a plain EventEmitter instead of a real Vite server.
 */
export { stopOnClose } from './lifecycle.ts';

/** Names a voice alias may point at: projects, layers, nodes and agents of the given towers. */
function namesOf(state: LoadResult | undefined, ids: string[]): string[] {
  const ws = state?.workspace;
  if (!ws) return [];
  const names = new Set(ws.projects.map((id) => ws.towers[id].name));
  for (const id of ids) {
    const t = ws.towers[id];
    if (!t) continue;
    names.add(t.name);
    for (const l of t.layers) {
      names.add(l.title);
      for (const n of l.nodes) { names.add(n.label); if (n.agent) names.add(n.agent.name); }
    }
  }
  return [...names].slice(0, 600);
}

/** A library entry that exists and is a folder; a missing or file entry is not a place to write shares. */
function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/** Nearest existing directory of each missing file: watching it reports the file when it appears. */
function existingDirs(files: Set<string>): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    let d = dirname(f);
    while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
    dirs.add(d);
  }
  return [...dirs];
}

async function serveFile(req: IncomingMessage, res: ServerResponse, state?: LoadResult) {
  if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
  const url = new URL(req.url ?? '', 'http://local');
  const tower = url.searchParams.get('tower') ?? '';
  const path = url.searchParams.get('path') ?? '';
  const root = state?.roots.get(tower);
  if (!root || !path) return send(res, 400, { error: 'missing or unknown tower/path' });
  const { status, body } = await readTowerFile(root, path);
  send(res, status, body);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
