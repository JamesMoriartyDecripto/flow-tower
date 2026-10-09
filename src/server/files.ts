import { open, readFile, realpath, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { safeJoin } from '../core/loader.ts';

const MAX_FILE_BYTES = 1_000_000;

export type FileResult =
  | { status: 200; body: { path: string; ext: string; content: string } }
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
    const { size } = await stat(abs);
    const isLog = /\.(log|jsonl|out|txt)$/.test(abs);
    if (size > MAX_FILE_BYTES && !isLog) return { status: 413, body: { error: 'file too large to preview' } };
    // Logs grow forever: show their tail instead of refusing them.
    const content = size > MAX_FILE_BYTES ? await readTail(abs, MAX_FILE_BYTES) : await readFile(abs, 'utf8');
    if (content.includes('\u0000')) return { status: 415, body: { error: 'binary file' } };
    return { status: 200, body: { path, ext: extname(abs).slice(1), content } };
  } catch {
    return { status: 404, body: { error: `file not found: ${path}` } };
  }
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
