import { useEffect, useMemo } from 'react';
import type { ResolvedEdge, ResolvedNode, ResolvedTower } from '../../core/types';
import { neighbours } from '../graph';
import { findNode, useStore } from '../store';

interface Conn { edge: ResolvedEdge; other: ResolvedNode; layer: number; dir: 'in' | 'out' }

const layerOf = (tower: ResolvedTower, node: ResolvedNode) => tower.layers.findIndex((l) => l.id === node.layer);

/** Every connection of a node: across layers first (by layer), then inside its own layer. */
export function connections(tower: ResolvedTower, key: string): { across: Conn[]; inside: Conn[] } {
  const self = findNode(tower, key);
  const { incoming, outgoing } = neighbours(tower, key);
  const all = [
    ...incoming.map((edge) => ({ edge, id: edge.from, dir: 'in' as const })),
    ...outgoing.map((edge) => ({ edge, id: edge.to, dir: 'out' as const })),
  ].flatMap(({ edge, id, dir }) => {
    const other = findNode(tower, id);
    return other ? [{ edge, other, layer: layerOf(tower, other), dir }] : [];
  });
  return {
    across: all.filter((c) => c.other.layer !== self?.layer).sort((a, b) => a.layer - b.layer || a.dir.localeCompare(b.dir)),
    inside: all.filter((c) => c.other.layer === self?.layer),
  };
}

/**
 * Nodes visited by jumping along connections, so the jump can be undone (B or the back button).
 * One trail per tower: node keys repeat across towers, and each tower keeps its own history.
 */
const trails = new Map<string, string[]>();
const trailOf = (tower: ResolvedTower) => trails.get(tower.id) ?? trails.set(tower.id, []).get(tower.id)!;

/** Selects a connected node and brings the camera to its layer. */
export function jump(tower: ResolvedTower, key: string, remember = true) {
  const s = useStore.getState();
  const node = findNode(tower, key);
  if (!node) return;
  if (remember && s.selected && s.selected !== key) trailOf(tower).push(s.selected);
  s.hover(undefined);
  s.select(key);
  const li = layerOf(tower, node);
  if (s.focusedLayer !== li) s.focusLayer(li);
  if (document.activeElement?.closest('.inspector')) {
    setTimeout(() => document.querySelector<HTMLElement>('.inspector .conn-section')?.focus(), 0);
  }
}

export function jumpBack(tower: ResolvedTower) {
  const trail = trailOf(tower);
  while (trail.length) {
    const key = trail.pop()!;
    if (findNode(tower, key)) return jump(tower, key, false);
  }
}

/** C / Shift+C: next / previous connected node (across layers first). */
export function cycleConnection(tower: ResolvedTower, step: number) {
  const s = useStore.getState();
  if (!s.selected) return;
  const { across, inside } = connections(tower, s.selected);
  const list = [...across, ...inside];
  if (!list.length) return;
  // Cycle from the node we came from, so repeated presses walk the whole list.
  const from = trailOf(tower).at(-1);
  const i = list.findIndex((c) => c.other.key === from);
  // No previous jump: C starts at the first connection, Shift+C at the last.
  const next = i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length;
  jump(tower, list[next].other.key);
}

function Row({ c, tower }: { c: Conn; tower: ResolvedTower }) {
  const hover = (key?: string) => useStore.getState().hover(key);
  // Esc closes the panel under the pointer: no mouseleave fires, so drop the hover this row set.
  useEffect(() => () => { if (useStore.getState().hovered === c.other.key) hover(undefined); }, [c.other.key]);
  return (
    <button
      className="conn"
      onClick={() => jump(tower, c.other.key)}
      onMouseEnter={() => hover(c.other.key)}
      onMouseLeave={() => hover(undefined)}
      onFocus={() => hover(c.other.key)}
      onBlur={() => hover(undefined)}
      title={`Go to ${c.other.label} (layer ${c.layer + 1}: ${tower.layers[c.layer]?.title})`}
    >
      <span className="k">{c.edge.kind.toUpperCase()}</span>
      <span className="arrow">{c.dir === 'in' ? '←' : '→'}</span>
      <span className="name">{c.other.label}</span>
      {c.edge.label && <span className="dim mono">· {c.edge.label}</span>}
      {c.edge.protocol && <span className="proto" title={c.edge.card ? `Agent card: ${c.edge.card}` : undefined}>{c.edge.protocol.toUpperCase()}{c.edge.version ? ` ${c.edge.version}` : ''}</span>}
      {c.edge.async && <span className="proto" title="Fire-and-forget: the source does not wait">ASYNC</span>}
      {c.edge.group && <span className="proto" title={`One of the alternatives in group "${c.edge.group}"`}>ALT</span>}
      <span className="lay">L{String(c.layer + 1).padStart(2, '0')}</span>
    </button>
  );
}

export function Connections({ node, tower }: { node: ResolvedNode; tower: ResolvedTower }) {
  const { across, inside } = useMemo(() => connections(tower, node.key), [tower, node.key]);
  const trail = trailOf(tower);
  const back = trail.length ? findNode(tower, trail[trail.length - 1]) : undefined;
  return (
    <>
      {back && (
        <button className="btn conn-back" onClick={() => jumpBack(tower)} title="Back to the node you came from (B)">
          ↩ Back to {back.label}
        </button>
      )}
      {across.length > 0 && (
        <div className="section conn-section" tabIndex={-1}>
          <span className="title">Across layers · {across.length}</span>
          {across.map((c) => <Row key={c.edge.id + c.dir} c={c} tower={tower} />)}
        </div>
      )}
      <div className="section conn-section" tabIndex={-1}>
        <span className="title">In this layer · {inside.length}</span>
        {inside.map((c) => <Row key={c.edge.id + c.dir} c={c} tower={tower} />)}
        {!inside.length && <span className="dim mono">No connections inside the layer.</span>}
      </div>
    </>
  );
}
