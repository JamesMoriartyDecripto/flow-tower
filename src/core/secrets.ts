import { realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { env } from 'node:process';

/**
 * What no tower may read or serve, whatever its root (#68 security review): key and credential files,
 * credential folders, and the user's own folder (key, voice journal, memory). One guard for the loader
 * (prompt `file:`, agent `from:`) and for /api/file. Node built-ins only: the static demo build imports
 * the loader and files.ts.
 */
const SECRET = /^(\.env(\..*)?|\.envrc|\.dev\.vars|\.git-credentials|\.npmrc|\.netrc|\.pgpass|\.pypirc|credentials(\.json)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|crt|p12|pfx|jks|keystore|tfvars))$/i;
/** Folders that only hold credentials (or the user's own voice journal and key): nothing inside them is read. */
const SECRET_DIRS = new Set(['.git', '.ssh', '.aws', '.gnupg', '.docker', '.kube', '.azure', '.config/gcloud', '.config/flow-tower']);

export const isSecretPath = (path: string) => {
  const parts = path.split(/[\\/]/).map((p) => p.toLowerCase());
  return SECRET.test(basename(path)) || parts.some((p, i) => SECRET_DIRS.has(p) || SECRET_DIRS.has(`${p}/${parts[i + 1]}`));
};

let home: { from: string | undefined; abs: string } | undefined;
/**
 * The user's own folder: ~/.config/flow-tower, or FLOW_TOWER_HOME (tests, e2e), resolved to an absolute
 * path once per value (a relative FLOW_TOWER_HOME must not follow later changes of the working directory).
 */
export function userHome() {
  const from = env.FLOW_TOWER_HOME || undefined;
  if (!home || home.from !== from) home = { from, abs: resolve(from ?? join(homedir(), '.config', 'flow-tower')) };
  return home.abs;
}

export const within = (root: string, abs: string) => {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** Inside the user's folder, as given or with symlinks resolved (FLOW_TOWER_HOME may sit inside a project). */
export async function inUserHome(abs: string) {
  const h = userHome();
  const real = await realpath(h).catch(() => h);
  return within(h, abs) || within(real, abs);
}

/** A file no tower may read: `abs` is the resolved path, `path` what the tower wrote. */
export const isForbidden = async (abs: string, path = abs) => isSecretPath(path) || isSecretPath(abs) || inUserHome(abs);

/** The same check, synchronous (existence probes, folder scans): `abs` is resolved through symlinks here. */
export function isForbiddenSync(abs: string, path = abs) {
  const real = realOrSelf(abs);
  const h = userHome();
  return isSecretPath(path) || isSecretPath(abs) || isSecretPath(real) || within(h, abs) || within(h, real) || within(realOrSelf(h), real);
}

/** realpath, or the path itself when it does not exist. */
export function realOrSelf(path: string) {
  try { return realpathSync(path); } catch { return path; }
}
