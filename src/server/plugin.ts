import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, loadEnvFile } from 'node:process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { loadLibrary, type LoadResult } from '../core/loader.ts';
import { readTowerFile } from './files.ts';
import { createEventHub, EVENTS_EVENT } from './events.ts';
import { checkForUpdate, updateCheckDisabled, type UpdateInfo } from './update.ts';
import { VOICE_DEFAULTS, voiceHandler } from './voice.ts';
import { voiceStore } from './voice-memory.ts';
import { crossSite } from './guard.ts';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = (JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
// A git checkout updates with git; anything else (a package install) points to the release page.
const UPDATE_COMMAND = existsSync(join(PKG_ROOT, '.git')) ? `cd ${PKG_ROOT} && git pull && npm install` : undefined;
// The user's own things (OPENROUTER_API_KEY, voice journal and memory) live in their config folder, not in
// the repo: ~/.config/flow-tower (or FLOW_TOWER_HOME). The git-ignored .env in the flow-tower folder is still
// read as a fallback. Real environment variables win, then the user folder, then the repo folder.
export const USER_HOME = env.FLOW_TOWER_HOME ?? join(homedir(), '.config', 'flow-tower');
for (const file of [join(USER_HOME, '.env'), join(PKG_ROOT, '.env')]) if (existsSync(file)) loadEnvFile(file);

export const UPDATE_EVENT = 'flow-tower:update';

/** Serves the resolved library + referenced files, and pushes live updates on change. */
export function flowTower(entries: string[] = JSON.parse(env.FLOW_TOWER_ENTRIES ?? '[]')): Plugin {
  let state: LoadResult | undefined;
  let timer: NodeJS.Timeout | undefined;
  // chokidar keeps one listener per add() call even for paths it already watches: add only new ones.
  const watching = new Set<string>();
  const watch = (server: ViteDevServer, paths: string[]) => {
    const fresh = paths.filter((p) => !watching.has(p));
    fresh.forEach((p) => watching.add(p));
    if (fresh.length) server.watcher.add(fresh);
  };

  const reload = async (server?: ViteDevServer) => {
    if (!entries.length) return;
    state = await loadLibrary(entries);
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

      // Reads are for this page only: Vite's default CORS would let a page on another localhost port read them.
      server.middlewares.use('/api/workspace', (req, res) => {
        if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
        if (!state?.workspace.projects.length) return send(res, 404, { error: 'no tower files found: run `flow-tower <file.tower.yaml | dir>`' });
        send(res, 200, state.workspace);
      });
      server.middlewares.use('/api/file', (req, res) => void serveFile(req, res, state));

      const hub = createEventHub(
        () => state?.workspace,
        (events) => server.ws.send(EVENTS_EVENT, events),
        env.FLOW_TOWER_TOKEN,
      );
      server.middlewares.use('/api/events', hub.handle);
      // OpenTelemetry: point OTEL_EXPORTER_OTLP_ENDPOINT at this server (http/json), see docs/realtime.md.
      server.middlewares.use('/v1/logs', hub.otlp('logs'));
      server.middlewares.use('/v1/metrics', hub.otlp('metrics'));
      server.middlewares.use('/v1/traces', hub.otlp('traces'));

      // Update notice (#35): one quiet check per start, never blocking the server.
      let update: UpdateInfo = { current: VERSION, newer: false };
      if (!updateCheckDisabled()) {
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
      server.middlewares.use('/api/version', (_req, res) => send(res, 200, { ...update, command: UPDATE_COMMAND }));
    },
  };
}

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
