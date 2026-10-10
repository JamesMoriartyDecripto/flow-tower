/**
 * Identity of an emitted event (#82), in plain JS so both the CLI and the tests can load it.
 * The core clips the same fields to the same length (src/core/identity.ts).
 */

/** Longest identity field kept. */
export const IDENTITY_MAX = 200;

/** Cut a string to `n` characters with a trailing ellipsis, like the core's clip. */
export const clip = (v, n = IDENTITY_MAX) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n - 1)}…` : v);

/** True when a URL points back at this machine; only there do user and host travel by default. */
export function isLoopbackUrl(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^\[|\]$/g, ''); } catch { return false; } // IPv6 comes bracketed
  return host === '::1' || host === 'localhost' || /^127\.\d+\.\d+\.\d+$/.test(host);
}

/** Identity fields clipped on the way out, so a huge flag or payload cannot bloat every event. */
export const IDENTITY_KEYS = ['user', 'host', 'runtime', 'project', 'session'];

/** Clip every identity field of an event, leaving the rest untouched. */
export function clipIdentity(event) {
  const out = { ...event };
  for (const key of IDENTITY_KEYS) if (out[key] !== undefined) out[key] = clip(out[key]);
  return out;
}

/**
 * The user and host defaults of one emit: this machine's os user and hostname, but only for a loopback
 * `url`, so a tower reached over the network never learns who you are unless you say so. FLOW_TOWER_USER
 * and FLOW_TOWER_MACHINE, when set, win over both; set to an empty string they disable that default.
 */
export function identityDefaults(url, env, os) {
  const local = isLoopbackUrl(url);
  const field = (name, fallback) => (env[name] === undefined ? (local ? fallback : undefined) : env[name] || undefined);
  return { user: field('FLOW_TOWER_USER', os.username), host: field('FLOW_TOWER_MACHINE', os.hostname) };
}
