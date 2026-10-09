import { useMemo } from 'react';
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

/** Nodes visited by jumping along connections, so the jump can be undone (B or the back button). */
const trail: string[] = [];

/** Selects a connected node and brings the camera to its layer. */
export function jump(tower: ResolvedTower, key: string, remember = true) {
  const s = useStore.getState();
  const node = findNode(tower, key);
  if (!node) return;
  if (remember && s.selected && s.selected !== key) trail.push(s.selected);
  s.hover(undefined);
  s.select(key);
  const li = layerOf(tower, node);
  if (s.focusedLayer !== li) s.focusLayer(li);
  if (document.activeElement?.closest('.inspector')) {
    setTimeout(() => document.querySelector<HTMLElement>('.inspector .conn-section')?.focus(), 0);
  }
}

export function jumpBack(tower: ResolvedTower) {
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
  const from = trail.at(-1);
  const i = list.findIndex((c) => c.other.key === from);
  jump(tower, list[(i + step + list.length) % list.length].other.key);
}

function Row({ c, tower }: { c: Conn; tower: ResolvedTower }) {
  const hover = (key?: string) => useStore.getState().hover(key);
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
      {c.edge.protocol && <span className="proto">{c.edge.protocol.toUpperCase()}</span>}
      <span className="lay">L{String(c.layer + 1).padStart(2, '0')}</span>
    </button>
  );
}

export function Connections({ node, tower }: { node: ResolvedNode; tower: ResolvedTower }) {
  const { across, inside } = useMemo(() => connections(tower, node.key), [tower, node.key]);
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
