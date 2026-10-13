import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadLibrary } from '../core/loader.ts';
import type { Issue } from '../core/types.ts';
import { authorize, refusal } from './auth.ts';
import { crossSite, isJson } from './guard.ts';
import { checkFiles, shareName } from './share-rules.ts';

/**
 * The errors that stop a share from replacing the hub's copy. A YAML-only share does not carry the prompt or
 * agent files the tower names, nor the folders outside the project or the secret files, so the hub reports
 * those as errors it cannot judge: they are expected here and must not refuse the share. Anything else (a
 * duplicate id, a bad edge, a YAML syntax error) is structural and does refuse it.
 */
const NOT_ON_HUB = /file not found|is outside the project|is a secret file/;
export function structuralErrors(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.level === 'error' && !NOT_ON_HUB.test(i.message));
}

/**
 * Tower folders uploaded by a satellite (#164): the satellite sends its folder signed with its sender token,
 * and the hub writes it into its own library under towers/<sender>/<name>/, where the loader picks it up.
 * A sender can only touch the folder named by its own token; the body never names the sender.
 */
export interface SharedTowersOptions {
  /** The hub's library folder (the first library entry that is a directory), or undefined when there is none. */
  library: string | undefined;
  /** The user folder holding tokens.json. */
  home: string;
  /** Hub mode as the caller knows it. */
  hub: boolean;
  /** FLOW_TOWER_TOKEN, the shared legacy secret: it answers as sender "default". */
  legacy?: string;
}

/**
 * The wire cap for one upload. A folder holds at most MAX_TOTAL_BYTES of content; JSON escaping and the
 * file names can add to that, so the cap sits well above the content limit and below anything that would
 * be buffered whole by accident.
 */
const MAX_BODY = 8 * 1024 * 1024;

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

/** True when `p` is `root` or a path below it. Both sides are resolved first, so `..` cannot step out. */
const inside = (root: string, p: string): boolean => {
  const rel = relative(resolve(root), resolve(p));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

/** One JSON body under MAX_BODY, or undefined after an error answer was sent. */
async function readBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) { send(res, 413, { error: 'body too large' }); req.destroy(); return undefined; }
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

/** The path below the mount: '' or '/' for the list, '/<name>' for one shared folder. */
function routeName(req: IncomingMessage): { root: boolean; name?: string } | undefined {
  const path = new URL(req.url ?? '', 'http://local').pathname;
  if (path === '' || path === '/') return { root: true };
  const m = /^\/([^/]+)\/?$/.exec(path);
  return m ? { root: false, name: m[1] } : undefined;
}

export function sharedTowersHandler({ library, home, hub, legacy }: SharedTowersOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // A satellite or a plain local library keeps no shared towers: only a hub has this route.
    if (!hub) return send(res, 404, { error: 'not a hub' });
    // Every route needs a presented token: a local request with no token is not a sender, so it is refused too.
    const authz = authorize(req, { legacy, home, hub });
    if (!authz.ok || !authz.sender) return send(res, 401, refusal(authz, 'a sender token is required'));
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (library === undefined) return send(res, 503, { error: 'this hub has no library folder' });

    const route = routeName(req);
    if (!route) return send(res, 404, { error: 'not found' });
    // The folder is the token's id, never a name from the body: a sender cannot reach another sender's folder.
    const sender = authz.sender;
    const towers = join(library, 'towers');
    const own = join(towers, sender);

    if (route.root) {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      return send(res, 200, { sender, towers: listFolders(own) });
    }

    const name = shareName(route.name ?? '');
    if (!name) return send(res, 400, { error: 'name must be a-z, 0-9 or - (up to 64 characters)' });
    const target = join(own, name);
    if (!inside(towers, target)) return send(res, 400, { error: 'path is outside the library' });

    if (req.method === 'DELETE') {
      const removed = existsSync(target);
      rmSync(target, { recursive: true, force: true });
      return send(res, 200, { name, removed });
    }
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' });
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });

    const body = await readBody(req, res);
    if (res.writableEnded || body === undefined) return;
    const checked = checkFiles((body as { files?: unknown } | null)?.files);
    if ('error' in checked) return send(res, 400, { error: checked.error });

    // A failed write must leave no half folder behind: it is staged next to the target, then renamed onto it.
    const staging = join(towers, '.staging', `${sender}-${name}-${randomBytes(6).toString('hex')}`);
    try {
      let bytes = 0;
      for (const f of checked.files) {
        const dest = join(staging, f.path);
        if (!inside(staging, dest)) throw new Error('file path escapes the staging folder');
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, f.content);
        bytes += Buffer.byteLength(f.content);
      }
      // Judged before the rename: a broken share must leave the last good copy on the hub, not replace it.
      const lib = await loadLibrary([staging]);
      const broken = [...Object.entries(lib.workspace.towers)]
        .flatMap(([id, t]) => structuralErrors(t.issues).map((i) => ({ file: fileOf(lib, staging, id), message: i.message })));
      if (broken.length > 0) {
        rmSync(staging, { recursive: true, force: true });
        return send(res, 422, { error: `the tower has errors: ${broken[0].file}: ${broken[0].message}`, state: 'invalid' });
      }
      mkdirSync(own, { recursive: true });
      rmSync(target, { recursive: true, force: true });
      renameSync(staging, target);
      return send(res, 200, { name, files: checked.files.length, bytes });
    } catch {
      rmSync(staging, { recursive: true, force: true });
      return send(res, 500, { error: 'could not store the shared tower' });
    }
  };
}

/** The tower file of tower `id` relative to `root`, for a message the user can act on. */
function fileOf(lib: { files: Map<string, string> }, root: string, id: string): string {
  const abs = lib.files.get(id);
  return abs ? relative(root, abs).split(sep).join('/') : id;
}

/** The shared folders of one sender, sorted; an empty list when the sender has none yet. */
function listFolders(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}
