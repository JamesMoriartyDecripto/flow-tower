/**
 * Library origins (#121c): a `flow-tower library` serve tags every project as the user's own (MINE) or a
 * shipped example (EXAMPLE), so a library card says which one is safe to edit. The plugin fills the
 * workspace's `origins` only in library mode; `npm run dev` on the examples leaves it undefined and shows
 * no badge. Kept out of plugin.ts so the wiring there stays one line.
 */
import { dirname, join, relative, sep } from 'node:path';
import { findTowerFiles } from '../core/loader.ts';
import { realOrSelf, within } from '../core/secrets.ts';

export type Origin = 'mine' | 'example';

export interface OriginOptions {
  /** The flow-tower checkout: a tower file under its examples/ is a shipped example, not the user's. */
  checkout: string;
  /** The user's own tower paths (FLOW_TOWER_MINE): a file under one of them is theirs. */
  mine: string[];
}

/** `FLOW_TOWER_MINE` as a list of paths: absent or hand-broken reads as none, like the CLI's own list. */
export function minePaths(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch { return []; }
}

/**
 * Where a tower file comes from, decided by its real path (symlinks resolved): a link into examples/ is
 * still an example, and a link inside one of the user's paths is still theirs. `undefined` for a file
 * under neither (a tower served some other way), which the card leaves unbadged.
 */
export function classifyOrigin(file: string, { checkout, mine }: OriginOptions): Origin | undefined {
  const real = realOrSelf(file);
  if (within(join(realOrSelf(checkout), 'examples'), real)) return 'example';
  if (mine.some((p) => within(realOrSelf(p), real))) return 'mine';
  return undefined;
}

/** The loader's id scheme, mirrored: `relative(base, file)` with '/' separators (see src/core/loader.ts). */
const toId = (base: string, file: string) => relative(base, file).split(sep).join('/');

/** The common directory of every tower file: the base the loader derives its ids against. */
function commonDir(files: string[]): string {
  let base = dirname(files[0]);
  while (!files.every((f) => f.startsWith(base + sep)) && dirname(base) !== base) base = dirname(base);
  return base;
}

/**
 * The origins of the projects a serve will load. `findTowerFiles` and `commonDir` are the loader's own
 * inputs, so the ids here match `workspace.projects`; `projects` is passed in to keep nested towers out.
 */
export function libraryOrigins(entries: string[], projects: string[], opts: OriginOptions): Record<string, Origin> {
  const files = findTowerFiles(entries);
  if (!files.length) return {};
  const base = commonDir(files);
  const wanted = new Set(projects);
  const out: Record<string, Origin> = {};
  for (const file of files) {
    const id = toId(base, file);
    if (!wanted.has(id)) continue;
    const origin = classifyOrigin(file, opts);
    if (origin) out[id] = origin;
  }
  return out;
}