/**
 * The message a snapshot page (`?snap=1`) posts to its parent. Both sides import it, so it must stay free of
 * three.js: the document page uses it and must never load the 3D app.
 */
export const SNAP_MESSAGE = 'flow-tower:snapshot';

export type SnapMessage = { type: typeof SNAP_MESSAGE; tower: string } & ({ png: string } | { error: string });

export function isSnapMessage(value: unknown): value is SnapMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { type?: unknown; tower?: unknown };
  return v.type === SNAP_MESSAGE && typeof v.tower === 'string';
}
