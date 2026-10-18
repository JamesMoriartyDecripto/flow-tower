/**
 * The local route behind the Settings list of shared towers (#266): it lists the shares with their sync state,
 * shares a library project with the hub, and unshares one. The work is done by share-actions.ts (step 01); this
 * file only maps a request to it and an outcome to a status code. Mounted at its own exact path by plugin.ts.
 *
 * It answers only its mount root, and uses the same guards as the sharing controls: a cross-site request is
 * refused, a remote viewer sees an empty list, and a remote POST is refused.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { isJson } from './guard.ts';
import { localOnly, isMountRoot, readBody, send } from './sharing.ts';
import { listShares, shareFolder, unshareFolder } from './share-actions.ts';
import { asShare } from './share-entries.ts';
import { readUserConfig } from './user-config.ts';
import type { ShareSync } from './share-sync.ts';

export interface SharingTowersOptions {
  /** The user folder holding config.json. */
  home: string;
  /** Hub mode as the server knows it: a remote request is refused whenever it counts as remote. */
  hub: boolean;
  /** The shared-towers sync, read on every request: it may start or stop while the server runs. */
  sync: () => Pick<ShareSync, 'state' | 'syncNow'> | undefined;
  /** The folder of a local library project; undefined for an unknown id or a tower another machine shared. */
  dirOf: (projectId: string) => string | undefined;
  /** Every local project id, so each share can list the projects that live in its folder (#266). Optional: a caller without it gets no project links. */
  projectIds: () => string[];
}

/** The hub's refusal or silence is a 502; any other unshare failure (e.g. no such share) is a 400. */
const HUB_FAILURE = /^(the hub refused|cannot reach the hub)/;

/**
 * The folder of a local library project, or undefined for an unknown id or a tower another machine shared: that
 * folder is not on this machine, so it can neither be shared from here nor counted as one of its projects.
 */
export function localProjectDir(files: Map<string, string>, sources: Record<string, string> | undefined, id: string): string | undefined {
  const file = files.get(id);
  if (!file || (sources?.[id] ?? 'local') !== 'local') return undefined;
  return dirname(file);
}

export function sharingTowersHandler({ home, hub, sync, dirOf, projectIds }: SharingTowersOptions) {
  /** The recorded shares with the sync state matched by name. Never a token. */
  const recorded = () => {
    const states = new Map((sync()?.state() ?? []).map((s) => [s.name, s]));
    const raw = readUserConfig(home).shares;
    const ids = projectIds();
    return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
      const share = asShare(entry);
      if (!share) return [];
      const s = states.get(share.name);
      return [{
        name: share.name,
        dir: share.dir,
        files: share.files,
        // The projects of this share's folder, so the card for each project can show its share state.
        projects: ids.filter((id) => dirOf(id) === share.dir),
        ...(s?.syncedAt !== undefined ? { syncedAt: s.syncedAt } : {}),
        ...(s?.error !== undefined ? { error: s.error } : {}),
        ...(s?.warning !== undefined ? { warning: s.warning } : {}),
      }];
    });
  };

  /** Once the hub has answered, the sync runs now so the list shows the new state at once. */
  const syncAfter = async () => {
    try { await sync()?.syncNow(); } catch { /* the next tick retries; the change itself already stands */ }
  };

  const connected = () => {
    const config = readUserConfig(home);
    return typeof config.url === 'string' && config.url !== '' && typeof config.token === 'string' && config.token !== '';
  };

  /** POST: share a project or unshare a name. The body must be JSON and is capped by readBody (413). */
  const post = async (req: IncomingMessage, res: ServerResponse) => {
    // A body that is not JSON is refused before it is read (a form post could otherwise reach this route).
    if (!isJson(req)) return send(res, 415, { error: 'content-type must be application/json' });
    const body = (await readBody(req, res)) as Record<string, unknown> | undefined;
    if (res.writableEnded) return; // 413 was already sent for an oversize body
    if (!connected()) return send(res, 409, { error: 'not connected: run flow-tower connect <hub-url> first' });

    if (typeof body?.project === 'string' && typeof body.files === 'boolean') {
      const dir = dirOf(body.project);
      if (dir === undefined) return send(res, 404, { error: 'unknown project' });
      const out = await shareFolder(home, dir, { files: body.files });
      // `sent` is set only when the hub refused or was unreachable; `conflict` is a name another folder's share holds.
      if (!out.ok) return send(res, out.sent ? 502 : out.conflict ? 409 : 400, { error: out.error });
      await syncAfter();
      // The token never leaves the server: only the sender's id, which the hub already shows.
      return send(res, 200, { name: out.name, files: out.files.length, skipped: out.skipped, sender: out.sender });
    }

    if (typeof body?.unshare === 'string') {
      // The route matches by name only: a folder path from the browser must never pick a share.
      const out = await unshareFolder(home, body.unshare, { force: body.force === true, byName: true });
      if (!out.ok) {
        // `unreachable` is the flag the Settings row reads; the regex only decides the status code.
        const failure = { error: out.error, ...(out.unreachable ? { unreachable: true } : {}) };
        return send(res, HUB_FAILURE.test(out.error) ? 502 : 400, failure);
      }
      await syncAfter();
      return send(res, 200, { name: out.name, gone: out.gone, hubReached: out.hubReached });
    }

    return send(res, 400, { error: 'expected { project, files } or { unshare }' });
  };

  /**
   * GET is the list. The hub is asked only for `?hub=1` (the Settings list on open), never by the 5 s poll.
   * A remote viewer gets an empty list: the folders on this machine are not theirs to see.
   */
  const towers = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!isMountRoot(req.url)) return next();
    if (!localOnly(req, res, hub, { shares: [] })) return;
    // Only GET and HEAD list and POST acts. Anything else is refused with the methods that do exist.
    if (req.method === 'POST') return post(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, POST');
      return send(res, 405, { error: 'method not allowed' });
    }
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.searchParams.get('hub') !== '1') return send(res, 200, { shares: recorded() });
    const listed = await listShares(home);
    return send(res, 200, { shares: recorded(), hub: listed.hub });
  };

  return { towers };
}
