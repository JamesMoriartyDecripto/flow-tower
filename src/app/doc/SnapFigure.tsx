import type { Snapshot } from './snapshots';

/**
 * The 3D figure at the start of a chapter: the tower as the dashboard shows its stacked layers. A failed
 * snapshot keeps its place as a visible placeholder with the reason, never a silent gap.
 */
export function SnapFigure({ towerTitle, layers, snap }: { towerTitle: string; layers: number; snap?: Snapshot }) {
  const caption = `3D view — ${towerTitle} (${layers} layers)`;
  return (
    <figure className="snap-figure">
      {/* The dark plate and the corner brackets are the dashboard's look; the frame keeps the doc's rounded edge. */}
      {snap && 'png' in snap
        ? <div className="snap-plate corners"><img src={snap.png} alt={caption} /></div>
        : <div className="snap-missing">{`3D view unavailable: ${snap && 'error' in snap ? snap.error : 'not captured'}`}</div>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
