import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { loadLibrary, type LoadResult } from '../core/loader.ts';
import { readTowerFile } from './files.ts';
import { createEventHub, EVENTS_EVENT } from './events.ts';
import { checkForUpdate, updateCheckDisabled, type UpdateInfo } from './update.ts';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = (JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
// A git checkout updates with git; anything else (a package install) points to the release page.
const UPDATE_COMMAND = existsSync(join(PKG_ROOT, '.git')) ? `cd ${PKG_ROOT} && git pull && npm install` : undefined;

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

      server.middlewares.use('/api/workspace', (_req, res) => {
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
      server.middlewares.use('/api/version', (_req, res) => send(res, 200, { ...update, command: UPDATE_COMMAND }));
    },
  };
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
