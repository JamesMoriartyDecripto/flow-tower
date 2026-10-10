import { layoutOf } from '../keynav';
import { useCurrentTowerLive } from '../liveHooks';
import { useStore, useTower } from '../store';
import { NODE_STYLE } from '../theme';

/**
 * Right panel with the nodes of the focused layer, in flow order: the names stay readable however
 * small or far the cards are. It holds the inspector's place while no node is selected; clicking a
 * row selects the node and the inspector takes over.
 */
export function NodeList() {
  const tower = useTower();
  const { focusedLayer, selected, hovered, hiddenTypes, select, hover } = useStore();
  const { states } = useCurrentTowerLive();
  const layer = focusedLayer === undefined ? undefined : tower?.layers[focusedLayer];
  if (!tower || !layer || selected) return null;
  // Flow order is the layout's left to right (then top to bottom), not the order in the file.
  const boxes = layoutOf(tower.id)?.layers[layer.index]?.nodes;
  const nodes = boxes ? [...layer.nodes].sort((a, b) => (boxes[a.key]?.x ?? 0) - (boxes[b.key]?.x ?? 0) || (boxes[a.key]?.z ?? 0) - (boxes[b.key]?.z ?? 0)) : layer.nodes;
  return (
    <aside className="panel nodelist" aria-label={`Nodes of ${layer.title}`}>
      <div className="title">
        <span className="idx">L{String(layer.index + 1).padStart(2, '0')}</span> {layer.title}
        <span className="count">{layer.nodes.length}</span>
      </div>
      {layer.description && <p className="nodelist-desc">{layer.description}</p>}
      {nodes.map((n) => {
        const live = states.get(n.key);
        return (
          <button
            key={n.key}
            className={`${hovered === n.key ? 'hot' : ''} ${hiddenTypes.has(n.type) ? 'muted' : ''} ${n.status !== 'active' ? 'status' : ''}`}
            onClick={() => select(n.key)}
            onMouseEnter={() => hover(n.key)}
            onMouseLeave={() => hover(undefined)}
            onFocus={() => hover(n.key)}
            onBlur={() => hover(undefined)}
            title={`${n.label}${n.status !== 'active' ? ` (${n.status})` : ''}${n.description ? ` — ${n.description}` : ''}`}
          >
            <span className="tag">{NODE_STYLE[n.type].tag}</span>
            <span className="name">{n.label}</span>
            {n.tower && <span className="sub" title="Opens a sub-tower">⇣</span>}
            {live && <span className={`live-dot ${live}`} />}
          </button>
        );
      })}
    </aside>
  );
}
