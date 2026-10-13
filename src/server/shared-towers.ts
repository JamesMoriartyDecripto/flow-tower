import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadLibrary } from '../core/loader.ts';
import type { Issue } from '../core/types.ts';
import { authorize, refusal } from './auth.ts';
import { crossSite, isJson } from './guard.ts';
import { checkFiles, shareName } from './share-rules.ts';

/**
 * The errors that stop a share from replacing the hub's copy. A YAML-only share does not carry the prompt or
 * agent files the tower names, nor the folders outside the project or the secret files, so the hub reports
 * those as errors it cannot judge: they carry a `code` and are expected here. Anything else (a duplicate id,
 * a bad edge, a YAML syntax error) has no code, is structural, and refuses the share. The code is the test,
 * never the message text: a node named "file not found" is still a structural error.
 */
export function structuralErrors(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.level === 'error' && i.code === undefined);
}

/**
 * The same split as structuralErrors, applied to what the hub shows (#165): a YAML-only share's missing or
 * outside files are not broken on the hub, so they become info with the machine named. Everything else keeps
 * its level. A new array is returned; the issues passed in are left as they were.
 */
export function relaxSharedIssues(issues: Issue[], machine: string): Issue[] {
  // Warnings too: a node's `files` entry missing on the hub is the same YAML-only case, not a problem to flag.
  return issues.map((i): Issue => ((i.level === 'error' || i.level === 'warning') && i.code !== undefined
    ? { ...i, level: 'info', message: `${i.message} (shared YAML only: the file stays on ${machine})` }
    : i));
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

/**
 * The last pending operation per `sender/name`. Two PUTs or a PUT and a DELETE for the same folder must not
 * interleave their renames, so each one waits for the one before it. The map keeps only the tail: an entry
 * is dropped once nothing is queued behind it.
 */
const queues = new Map<string, Promise<void>>();
function serialized<T>(key: string, op: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(op);
  const tail = run.then(() => undefined, () => undefined);
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

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
    const key = `${sender}/${name}`;

    if (req.method === 'DELETE') {
      return serialized(key, async () => {
        const removed = existsSync(target);
        // Moved aside, then deleted: a failed delete leaves no half folder under the share's name.
        try {
          if (removed) rmSync(moveAside(target, towers), { recursive: true, force: true });
        } catch {
          return send(res, 500, { error: 'could not remove the shared tower' });
        }
        return send(res, 200, { name, removed });
      });
    }
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' });
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });

    const body = await readBody(req, res);
    if (res.writableEnded || body === undefined) return;
    const checked = checkFiles((body as { files?: unknown } | null)?.files);
    if ('error' in checked) return send(res, 400, { error: checked.error });

    return serialized(key, () => storeShare({ checked, towers, own, target, name, sender, res }));
  };
}

/**
 * Stages the upload, judges it, and swaps it in. A failed write leaves no half folder: the staging folder is
 * only renamed onto the target once the copy is complete and judged, and the old copy is moved aside first
 * and only deleted after the new one is in place (so the target is never missing).
 */
async function storeShare(args: {
  checked: { files: { path: string; content: string }[] };
  towers: string; own: string; target: string; name: string; sender: string; res: ServerResponse;
}): Promise<void> {
  const { checked, towers, own, target, name, res } = args;
  const staging = join(towers, '.staging', `${args.sender}-${name}-${randomBytes(6).toString('hex')}`);
  let old: string | undefined;
  try {
    let bytes = 0;
    for (const f of checked.files) {
      const dest = join(staging, f.path);
      if (!inside(staging, dest)) throw new Error('file path escapes the staging folder');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, f.content);
      bytes += Buffer.byteLength(f.content);
    }
    // Judged before the swap: a broken share must leave the last good copy on the hub, not replace it. The
    // staging folder is its own project: a shared tower reads nothing outside the folder it was uploaded to.
    const lib = await loadLibrary([staging], { projectOf: () => staging });
    const broken = [...Object.entries(lib.workspace.towers)]
      .flatMap(([id, t]) => structuralErrors(t.issues).map((i) => ({ file: fileOf(lib, staging, id), message: i.message })));
    if (broken.length > 0) {
      rmSync(staging, { recursive: true, force: true });
      return send(res, 422, { error: `the tower has errors: ${broken[0].file}: ${broken[0].message}`, state: 'invalid' });
    }
    mkdirSync(own, { recursive: true });
    // Rename the old copy aside, put the new one in its place, and only then delete the old one. A failed rename
    // puts the old copy back, so the folder is never left missing.
    if (existsSync(target)) old = moveAside(target, towers);
    try {
      renameSync(staging, target);
    } catch (err) {
      if (old) renameSync(old, target);
      throw err;
    }
    // The new copy is in place: a failed cleanup of the old one must not turn the success into a 500.
    if (old) try { rmSync(old, { recursive: true, force: true }); } catch { /* left under .staging, harmless */ }
    return send(res, 200, { name, files: checked.files.length, bytes });
  } catch {
    rmSync(staging, { recursive: true, force: true });
    return send(res, 500, { error: 'could not store the shared tower' });
  }
}

/**
 * Renames `target` into `towers/.staging/` under a random `.old-` name and returns that path. The same folder
 * keeps it a plain rename (no copy), and `.staging` is hidden from the library listing.
 */
function moveAside(target: string, towers: string): string {
  const staging = join(towers, '.staging');
  mkdirSync(staging, { recursive: true });
  const aside = join(staging, `${basename(target)}.old-${randomBytes(6).toString('hex')}`);
  renameSync(target, aside);
  return aside;
}

/**
 * The tower file of tower `id` relative to `root`, for a message the user can act on. Only a path inside the
 * root is shown; anything else falls back to the tower id, so no `../` path is ever named to the user.
 */
function fileOf(lib: { files: Map<string, string> }, root: string, id: string): string {
  const abs = lib.files.get(id);
  return abs && inside(root, abs) ? relative(root, abs).split(sep).join('/') : id;
}

/** The shared folders of one sender, sorted; an empty list when the sender has none yet. */
function listFolders(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}
