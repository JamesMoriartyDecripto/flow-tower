/**
 * Forced update check (#141): the top bar's "check now" button. The daily check in update.ts is quiet and
 * cheap, but a user who wants to know right after a release must be able to ask. This endpoint is a local
 * write in effect (it makes the only outbound call the app does), so it is guarded like sharing's controls:
 * a cross-site request and a remote viewer are both refused before any call leaves the machine.
 *
 * One GitHub call per minute at most: a button that can be pressed repeatedly must not become a way to
 * hammer the API (or the user's rate limit). Inside that window the last result is replayed with
 * `throttled: true`, so the UI still gets an answer.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite } from './guard.ts';
import { isRemote } from './auth.ts';
import type { UpdateInfo } from './update.ts';
import { versionPayload } from './plugin.ts';

export interface VersionCheckOptions {
  /** The running version, echoed in every answer. */
  current: string;
  /** Hub mode as the server knows it: a remote viewer must never trigger the outbound call. */
  hub: boolean;
  /** Whether the update check is off (opt-out variable, CI): then no call and no cache write. */
  disabled: boolean;
  /** The forced check, injectable so tests need no network. */
  check: (args: { current: string; force: true }) => Promise<UpdateInfo>;
  /** The clock, injectable so tests can drive the 60 s window. */
  now: () => number;
  /** Publishes the fresh result back to the plugin, so /api/version and the chip see it too. */
  set: (info: UpdateInfo) => void;
  /** Minimum gap between two real checks. */
  throttleMs?: number;
}

/** The gap between two real checks: one a minute is plenty for a release notice. */
const THROTTLE_MS = 60_000;

export function versionCheckHandler({ current, hub, disabled, check, now, set, throttleMs = THROTTLE_MS }: VersionCheckOptions) {
  // Shared with the plugin via set(): the last answer and when it was obtained, for the throttle window.
  let last: UpdateInfo | undefined;
  let lastAt = 0;

  return async (req: IncomingMessage, res: ServerResponse, _next: () => void): Promise<void> => {
    // A local control: another page must not reach it, a remote viewer must not either (and must not make
    // this machine call out on their behalf).
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (isRemote(req, { hub })) return send(res, 403, { error: 'remote requests are refused' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });

    if (disabled) return send(res, 200, { current, newer: false, disabled: true });

    // Inside the window: replay the last result instead of asking again, so the repeated press is honest
    // about having done nothing new.
    if (last && now() - lastAt < throttleMs) {
      return send(res, 200, { ...versionPayload(last, false), throttled: true });
    }

    const result = await check({ current, force: true });
    last = result;
    lastAt = now();
    // The plugin's own variable drives /api/version and the top bar, so a later read sees this answer.
    set(result);
    return send(res, 200, versionPayload(result, false));
  };
}

/** The JSON shape shared with the other handlers here: no-store, since every answer is fresh. */
function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
