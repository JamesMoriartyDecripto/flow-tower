import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { pid } from 'node:process';
import { join } from 'node:path';
import { userHome } from '../core/secrets.ts';

/**
 * Per-sender hub tokens (#83): /api/hub calls are signed with "ft_<id>_<secret>", where the file only
 * ever holds the sha256 of the whole token. Revoked or paused tokens are refused, the plaintext never
 * touches the disk, and a borrowed token is useless after a revoke.
 */
export interface TokenRecord { id: string; sha256: string; createdAt: number; revokedAt?: number; paused?: boolean }
export interface TokenInfo { id: string; createdAt: number; revokedAt?: number; paused?: boolean }

/** The sender id ends up in a token: a short slug, nothing that could be a path or a header trick. */
const ID = /^[a-z0-9-]{1,32}$/;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** "ft_<id>_<secret>", the id alone is a slug so the first two underscores split it cleanly. */
const parse = (token: unknown): { id: string; token: string } | undefined => {
  if (typeof token !== 'string') return undefined;
  const m = /^ft_([a-z0-9-]{1,32})_([A-Za-z0-9_-]{8,})$/.exec(token);
  return m ? { id: m[1], token } : undefined;
};

export function tokenStore(home = userHome()) {
  const file = join(home, 'tokens.json');
  /** Owner only, where we may decide it; a file system that refuses chmod (EPERM) is not an error. */
  const ownerOnly = (path: string, mode: number) => { try { chmodSync(path, mode); } catch { /* best effort */ } };
  const ensure = () => {
    // Only a folder we create is ours to lock down; one the user chose is left as it is.
    if (!existsSync(home)) { mkdirSync(home, { recursive: true, mode: 0o700 }); ownerOnly(home, 0o700); }
  };
  /** Temp file plus a rename (a crash never leaves half a file), one retry for a Windows EPERM/EBUSY. */
  const write = (list: TokenRecord[]) => {
    ensure();
    const tmp = `${file}.${pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
      try { renameSync(tmp, file); } catch (err) {
        if (!['EPERM', 'EBUSY'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
        renameSync(tmp, file);
      }
      ownerOnly(file, 0o600);
    } finally {
      rmSync(tmp, { force: true });
    }
  };
  /** What is on disk, with anything malformed dropped; reloaded when another process rewrote the file. */
  let cache: { mtime: number; list: TokenRecord[] } | undefined;
  const load = (): TokenRecord[] => {
    let mtime = 0;
    try { mtime = statSync(file).mtimeMs; } catch { mtime = 0; }
    if (cache && cache.mtime === mtime) return cache.list;
    let list: TokenRecord[] = [];
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<TokenRecord>[];
      list = (Array.isArray(raw) ? raw : []).filter((t): t is TokenRecord => !!t && typeof t.id === 'string' && typeof t.sha256 === 'string');
    } catch { /* missing or hand-edited: an empty store, never a crash */ }
    cache = { mtime, list };
    return list;
  };
  const save = (list: TokenRecord[]) => { write(list); cache = undefined; };
  const info = ({ id, createdAt, revokedAt, paused }: TokenRecord): TokenInfo => ({ id, createdAt, ...(revokedAt === undefined ? {} : { revokedAt }), ...(paused ? { paused } : {}) });

  return {
    /** A new sender: the id must be a slug and not already active (a revoked one may be reused). */
    create(id: string): { token: string } {
      if (!ID.test(id)) throw new Error('a token id is 1-32 characters of a-z, 0-9 or -');
      const list = load();
      if (list.some((t) => t.id === id && t.revokedAt === undefined)) throw new Error(`token ${id} already exists`);
      const token = `ft_${id}_${randomBytes(32).toString('base64url')}`;
      list.push({ id, sha256: sha256(token), createdAt: Date.now() });
      save(list);
      return { token };
    },
    /** The hashes stay in the file: what the Settings panel sees is metadata only. */
    list(): TokenInfo[] { return load().map(info); },
    revoke(id: string) {
      const list = load();
      const t = list.find((x) => x.id === id);
      if (!t || t.revokedAt !== undefined) return;
      t.revokedAt = Date.now();
      save(list);
    },
    pause(id: string, paused: boolean) {
      const list = load();
      const t = list.find((x) => x.id === id);
      if (!t || t.revokedAt !== undefined) return;
      if (paused) t.paused = true; else delete t.paused;
      save(list);
    },
    /** The id comes from the token, but the hash is checked against the stored one: a guessed id gets nowhere. */
    verify(presented: unknown): { id: string } | undefined {
      const parsed = parse(presented);
      if (!parsed) return undefined;
      const t = load().find((x) => x.id === parsed.id);
      if (!t || t.revokedAt !== undefined || t.paused) return undefined;
      const a = Buffer.from(sha256(parsed.token), 'hex');
      const b = Buffer.from(t.sha256, 'hex');
      return a.length === b.length && timingSafeEqual(a, b) ? { id: t.id } : undefined;
    },
  };
}
export type TokenStore = ReturnType<typeof tokenStore>;
