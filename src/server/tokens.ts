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
/** `login` is the tailnet login that enrolled the token (#164); hand-made tokens have none. */
export interface TokenRecord { id: string; sha256: string; createdAt: number; revokedAt?: number; paused?: boolean; login?: string }
export interface TokenInfo { id: string; createdAt: number; revokedAt?: number; paused?: boolean; login?: string }

/** The sender id ends up in a token: a short slug, nothing that could be a path or a header trick. */
const ID = /^[a-z0-9-]{1,32}$/;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** "ft_<id>_<secret>", the id alone is a slug so the first two underscores split it cleanly. */
const parse = (token: unknown): { id: string; token: string } | undefined => {
  if (typeof token !== 'string') return undefined;
  const m = /^ft_([a-z0-9-]{1,32})_([A-Za-z0-9_-]{8,})$/.exec(token);
  return m ? { id: m[1], token } : undefined;
};

/**
 * One store per home for the whole process (#83): authorize runs on every ingest request and must not
 * re-read tokens.json each time. The store still stat()s the file on each verify, so `token add/revoke`
 * in another process is picked up by the mtime check — this memoizes the object, not the file content.
 */
const stores = new Map<string, TokenStore>();

export function tokenStore(home = userHome()): TokenStore {
  const key = join(home, 'tokens.json');
  const existing = stores.get(key);
  if (existing) return existing;
  const store = createTokenStore(home);
  stores.set(key, store);
  return store;
}

function createTokenStore(home: string) {
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
  const info = ({ id, createdAt, revokedAt, paused, login }: TokenRecord): TokenInfo => ({ id, createdAt, ...(revokedAt === undefined ? {} : { revokedAt }), ...(paused ? { paused } : {}), ...(login === undefined ? {} : { login }) });
  /** One place that mints a token and its record, so `create` and `enroll` cannot drift apart. */
  const mint = (id: string, login?: string): { token: string; record: TokenRecord } => {
    const token = `ft_${id}_${randomBytes(32).toString('base64url')}`;
    return { token, record: { id, sha256: sha256(token), createdAt: Date.now(), ...(login === undefined ? {} : { login }) } };
  };
  const active = (list: TokenRecord[], id: string) => list.find((t) => t.id === id && t.revokedAt === undefined);

  /**
   * The id comes from the token, but the hash is checked against the stored one: a guessed id gets nowhere.
   * `refused: 'paused'` is answered only after the hash matched the active record: a wrong secret must not
   * learn that an id exists or is paused (#188), so it gets the same `undefined` as an unknown token.
   */
  const check = (presented: unknown): { id: string } | { refused: 'paused' } | undefined => {
    const parsed = parse(presented);
    if (!parsed) return undefined;
    // A rotated id keeps its revoked record in the list, so only the active one may match.
    const t = active(load(), parsed.id);
    if (!t) return undefined;
    const a = Buffer.from(sha256(parsed.token), 'hex');
    const b = Buffer.from(t.sha256, 'hex');
    if (!(a.length === b.length && timingSafeEqual(a, b))) return undefined;
    return t.paused ? { refused: 'paused' } : { id: t.id };
  };

  return {
    /** A new sender: the id must be a slug and not already active (a revoked one may be reused). */
    create(id: string): { token: string } {
      if (!ID.test(id)) throw new Error('a token id is 1-32 characters of a-z, 0-9 or -');
      const list = load();
      if (active(list, id)) throw new Error(`token ${id} already exists`);
      const { token, record } = mint(id);
      list.push(record);
      save(list);
      return { token };
    },
    /**
     * A tailnet viewer's machine (#164). Re-enrolling by the same login rotates the token, so a reconnect
     * replaces the old one; any other login, or a hand-made token, is refused so nobody takes over an id.
     * Every record with the id counts, revoked ones too: a revoked id keeps the towers its old owner shared
     * under `towers/<id>/`, so a stranger must not inherit them. The hub owner can still free an id by hand
     * (editing tokens.json); `token add` is not a path around this.
     */
    enroll(id: string, login: string): { token: string; rotated: boolean } {
      if (!ID.test(id)) throw new Error('a token id is 1-32 characters of a-z, 0-9 or -');
      if (typeof login !== 'string' || login.trim() === '') throw new Error('enrolment needs a non-empty tailnet login');
      // `default` is the legacy FLOW_TOWER_TOKEN sender; no machine may take its name.
      if (id === 'default') throw new Error('conflict: default is reserved');
      const list = load();
      if (list.some((t) => t.id === id && t.login !== login)) throw new Error(`conflict: token ${id} belongs to another user`);
      const current = active(list, id);
      const { token, record } = mint(id, login);
      // A machine the hub owner paused stays paused: re-enrolling must not be a way around that switch.
      if (current?.paused) record.paused = true;
      if (current) current.revokedAt = Date.now();
      list.push(record);
      save(list);
      return { token, rotated: current !== undefined };
    },
    /** The hashes stay in the file: what the Settings panel sees is metadata only. */
    list(): TokenInfo[] { return load().map(info); },
    revoke(id: string) {
      const list = load();
      const t = active(list, id);
      if (!t || t.revokedAt !== undefined) return;
      t.revokedAt = Date.now();
      save(list);
    },
    pause(id: string, paused: boolean) {
      const list = load();
      const t = active(list, id);
      if (!t) return;
      if (paused) t.paused = true; else delete t.paused;
      save(list);
    },
    /** The hub's answer: `check` tells a paused token apart, but only `verify` passes it. */
    check,
    /** Only an active, unpaused token verifies (the contract every caller relies on). */
    verify(presented: unknown): { id: string } | undefined {
      const hit = check(presented);
      return hit && 'id' in hit ? hit : undefined;
    },
  };
}
export type TokenStore = ReturnType<typeof createTokenStore>;
