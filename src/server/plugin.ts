import { open, readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { env } from 'node:process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { loadLibrary, safeJoin, type LoadResult } from '../core/loader.ts';
import { createEventHub, EVENTS_EVENT } from './events.ts';

const MAX_FILE_BYTES = 1_000_000;
export const UPDATE_EVENT = 'flow-tower:update';

/** Serves the resolved library + referenced files, and pushes live updates on change. */
export function flowTower(entries: string[] = JSON.parse(env.FLOW_TOWER_ENTRIES ?? '[]')): Plugin {
  let state: LoadResult | undefined;
  let timer: NodeJS.Timeout | undefined;

  const reload = async (server?: ViteDevServer) => {
    if (!entries.length) return;
    state = await loadLibrary(entries);
    if (server) {
      server.watcher.add([...state.watched]);
      server.ws.send(UPDATE_EVENT, { loadedAt: state.workspace.loadedAt });
    }
  };

  return {
    name: 'flow-tower',
    async configureServer(server) {
      await reload();
      if (state) server.watcher.add([...state.watched, ...entries.map((e) => resolve(e))]);
      // A tower file added to or removed from a watched directory changes the library too.
      const onFsEvent = (file: string) => {
        if (!state?.watched.has(file) && !file.endsWith('.tower.yaml')) return;
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
    },
  };
}

async function serveFile(req: IncomingMessage, res: ServerResponse, state?: LoadResult) {
  const url = new URL(req.url ?? '', 'http://local');
  const tower = url.searchParams.get('tower') ?? '';
  const path = url.searchParams.get('path') ?? '';
  const root = state?.roots.get(tower);
  if (!root || !path) return send(res, 400, { error: 'missing or unknown tower/path' });

  try {
    // realpath on both sides so symlinks cannot escape the tower root
    const realRoot = await realpath(root);
    const candidate = safeJoin(realRoot, path);
    const abs = candidate && await realpath(candidate);
    if (!abs || !safeJoin(realRoot, abs)) return send(res, 403, { error: 'path outside tower root' });
    const { size } = await stat(abs);
    const isLog = /\.(log|jsonl|out|txt)$/.test(abs);
    if (size > MAX_FILE_BYTES && !isLog) return send(res, 413, { error: 'file too large to preview' });
    // Logs grow forever: show their tail instead of refusing them.
    const content = size > MAX_FILE_BYTES ? await readTail(abs, MAX_FILE_BYTES) : await readFile(abs, 'utf8');
    if (content.includes('\u0000')) return send(res, 415, { error: 'binary file' });
    send(res, 200, { path, ext: extname(abs).slice(1), content });
  } catch {
    send(res, 404, { error: `file not found: ${path}` });
  }
}

async function readTail(path: string, bytes: number): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const { size } = await fh.stat();
    const buf = Buffer.alloc(bytes);
    await fh.read(buf, 0, bytes, size - bytes);
    const text = buf.toString('utf8');
    return `… (showing last ${Math.round(bytes / 1024)} KB)\n${text.slice(text.indexOf('\n') + 1)}`;
  } finally {
    await fh.close();
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
