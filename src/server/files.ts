import { open, readFile, realpath, stat } from 'node:fs/promises';
import { extname, sep } from 'node:path';
import { safeJoin } from '../core/loader.ts';
import { parseSqlSchema, type DbPreview } from '../core/dbPreview.ts';
import { isForbidden, isSecretPath } from '../core/secrets.ts';
import { isSqliteFile, readSqlitePreview } from './sqlite-preview.ts';

const MAX_FILE_BYTES = 1_000_000;
/**
 * Secrets are never served, even inside a tower root: a dogfood tower with `root: ../..` has the
 * flow-tower folder as its root, and that is where the local key file lives (src/core/secrets.ts).
 */
export { isSecretPath };

export type FileResult =
  | { status: 200; body: { path: string; ext: string; content: string; db?: DbPreview } }
  | { status: 403 | 404 | 413 | 415; body: { error: string } };

/**
 * Reads one referenced file for the viewer, confined to the tower root (symlinks resolved on both
 * sides). Shared by the dev server (/api/file) and the static demo build, so both apply the same rules.
 */
export async function readTowerFile(root: string, path: string): Promise<FileResult> {
  try {
    const realRoot = await realpath(root);
    const candidate = safeJoin(realRoot, path);
    const abs = candidate && await realpath(candidate);
    if (!abs || !safeJoin(realRoot, abs)) return { status: 403, body: { error: 'path outside tower root' } };
    if (await isForbidden(abs, path)) return { status: 403, body: { error: 'secret files are never served' } };
    // A database is answered as a preview (schema and first rows), whatever its size: only the preview is read.
    if (await isSqliteFile(abs)) {
      const preview = await readSqlitePreview(abs);
      if ('error' in preview) return { status: 415, body: { error: preview.error } };
      return { status: 200, body: { path, ext: extname(abs).slice(1), content: preview.content, db: preview.db } };
    }
    const { size } = await stat(abs);
    const isLog = /\.(log|jsonl|out|txt)$/.test(abs);
    if (size > MAX_FILE_BYTES && !isLog) return { status: 413, body: { error: 'file too large to preview' } };
    // Logs grow forever: show their tail instead of refusing them.
    const content = size > MAX_FILE_BYTES ? await readTail(abs, MAX_FILE_BYTES) : await readFile(abs, 'utf8');
    if (content.includes('\u0000')) return { status: 415, body: { error: 'binary file' } };
    const ext = extname(abs).slice(1);
    // A .sql file is a schema, so its tables show like a database's; no tables means no db field.
    const tables = ext === 'sql' ? parseSqlSchema(content) : [];
    const db: DbPreview | undefined = tables.length > 0 ? { source: 'sql', tables } : undefined;
    return { status: 200, body: { path, ext, content, ...(db ? { db } : {}) } };
  } catch {
    return { status: 404, body: { error: `file not found: ${path}` } };
  }
}

/**
 * True when the tower root is the library folder or lies under it, with both paths resolved by realpath: a
 * symlink inside the library that points elsewhere is outside. A missing path is outside too, since there is
 * nothing to confine. The separator is appended before the prefix test, so `/srv/lib-other` is not under `/srv/lib`.
 */
export async function insideLibrary(root: string, library: string | undefined): Promise<boolean> {
  if (!library) return false;
  let real: string;
  let base: string;
  try {
    [real, base] = await Promise.all([realpath(root), realpath(library)]);
  } catch {
    return false;
  }
  const prefix = base.endsWith(sep) ? base : base + sep;
  return real === base || real.startsWith(prefix);
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
