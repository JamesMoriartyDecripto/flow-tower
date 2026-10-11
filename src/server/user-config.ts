/**
 * The user folder's config.json (#90, #91): the one file both `flow-tower connect` and the server's
 * sharing control write to. Two writers of the same file must agree on how it is merged and locked
 * down, so the read/merge/write lives here once instead of twice.
 *
 * Node only: the browser bundle never imports this.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripJsonc } from '../../bin/config-file.js';

export const userConfigPath = (home: string) => join(home, 'config.json');

/**
 * Every existing key is kept and the JSONC comments are dropped: the callers own a few keys of one file,
 * and a hand-written viewer list or retention setting must survive them. A missing or hand-broken file
 * is not an error: the merge simply starts from an empty object.
 */
export function readUserConfig(home: string): Record<string, unknown> {
  try {
    const value = JSON.parse(stripJsonc(readFileSync(userConfigPath(home), 'utf8'))) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch { return {}; }
}

/**
 * Merge `patch` into <home>/config.json, keeping every other key. The file may hold a token, so it is
 * written owner-only (0600); like `token`, only a folder we create is ours to lock down.
 */
export function writeUserConfig(home: string, patch: Record<string, unknown>): string {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  try { chmodSync(home, 0o700); } catch { /* best effort: a filesystem that refuses chmod is not an error */ }
  const file = userConfigPath(home);
  const next = { ...readUserConfig(home), ...patch };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* the file may hold a token: lock it down where we can */ }
  return file;
}
