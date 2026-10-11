/**
 * Library origins (#121c): a `flow-tower library` serve tags every project as the user's own (MINE) or a
 * shipped example (EXAMPLE), so a library card says which one is safe to edit. The plugin fills the
 * workspace's `origins` only in library mode; `npm run dev` on the examples leaves it undefined and shows
 * no badge. Kept out of plugin.ts so the wiring there stays one line.
 */
import { join } from 'node:path';
import { commonDir, findTowerFiles, toId } from '../core/loader.ts';
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

/**
 * The origins of the projects a serve will load. `findTowerFiles`, `commonDir` and `toId` are the loader's
 * own: the ids must match `workspace.projects`, so they are not re-derived here; `projects` is passed in to
 * keep nested towers out.
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
