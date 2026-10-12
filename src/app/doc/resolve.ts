import { deepLink } from '../graph';
import type { Workspace } from '../../core/types';

/**
 * The tower named by `?doc=`, resolved like a deep link (`?tower=`): the id, the file name without
 * `.tower.yaml`, or the tower name. A nested tower that is not reachable from a project still resolves
 * by its id, so a shared link to it does not fail.
 */
export function resolveTower(ws: Workspace, want: string): string | undefined {
  if (!want) return undefined;
  const link = deepLink(ws, `?tower=${encodeURIComponent(want)}`);
  return link?.stack.at(-1) ?? (ws.towers[want] ? want : undefined);
}

/** `?level=` clamped to 1-3; anything missing or not a number is the default, 2. */
export function clampLevel(raw: string | null): 1 | 2 | 3 {
  if (raw === null || raw.trim() === '') return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.round(n))) as 1 | 2 | 3;
}
