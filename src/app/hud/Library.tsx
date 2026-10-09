import { useMemo, useState } from 'react';
import type { ResolvedTower, Workspace } from '../../core/types';
import { useStore } from '../store';

interface Stats {
  layers: number;
  nodes: number;
  agents: number;
  links: number;
  subTowers: number;
  depth: number;
  models: string[];
  errors: number;
  warnings: number;
}

/** Aggregates a project and every tower nested below it. */
export function projectStats(ws: Workspace, id: string): Stats {
  const s: Stats = { layers: 0, nodes: 0, agents: 0, links: 0, subTowers: 0, depth: 0, models: [], errors: 0, warnings: 0 };
  const models = new Set<string>();
  const seen = new Set<string>();
  const visit = (tid: string, depth: number) => {
    const t = ws.towers[tid];
    if (!t || seen.has(tid)) return;
    seen.add(tid);
    s.depth = Math.max(s.depth, depth);
    if (depth > 0) s.subTowers++;
    for (const i of t.issues) { if (i.level === 'error') s.errors++; if (i.level === 'warning') s.warnings++; }
    s.layers += t.layers.length;
    s.links += t.links.length + t.layers.reduce((a, l) => a + l.edges.length, 0);
    for (const l of t.layers) for (const n of l.nodes) {
      s.nodes++;
      if (n.type === 'agent') s.agents++;
      if (n.model) models.add(n.model.replace(/^claude-/, ''));
      if (n.tower) visit(n.tower, depth + 1);
    }
  };
  visit(id, 0);
  s.models = [...models].sort();
  return s;
}

/** Stacked plates drawn in SVG: a thumbnail of the tower's shape. */
function MiniTower({ tower }: { tower: ResolvedTower }) {
  const layers = tower.layers.slice(0, 16);
  const max = Math.max(1, ...layers.map((l) => l.nodes.length));
  const gap = Math.min(10, 120 / Math.max(layers.length, 1));
  return (
    <svg viewBox="0 0 160 150" className="minitower" aria-hidden>
      {layers.map((l, i) => {
        const w = 50 + (l.nodes.length / max) * 70;
        const y = 12 + i * gap;
        const x = 80 - w / 2;
        return (
          <g key={l.id}>
            <polygon points={`${x + 14},${y} ${x + w + 14},${y} ${x + w},${y + 8} ${x},${y + 8}`} className="plate" />
            {Array.from({ length: Math.min(l.nodes.length, 12) }, (_, k) => (
              <rect key={k} x={x + 6 + k * ((w - 4) / 12)} y={y + 2.5} width={3} height={3} className="dot" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Project gallery: every top-level tower found by the CLI, with size and health at a glance. */
export function Library() {
  const { workspace, library, stack, openProject, showLibrary } = useStore();
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState<string>();

  const cards = useMemo(() => (workspace?.projects ?? []).map((id) => ({
    id, tower: workspace!.towers[id], stats: projectStats(workspace!, id),
  })), [workspace]);
  const tags = useMemo(() => [...new Set(cards.flatMap((c) => c.tower.tags))].sort(), [cards]);
  if (!library || !workspace) return null;

  const q = filter.trim().toLowerCase();
  const shown = cards.filter((c) =>
    (!tag || c.tower.tags.includes(tag)) &&
    (!q || [c.tower.name, c.tower.description, ...c.tower.tags].some((v) => v?.toLowerCase().includes(q))));
  const total = cards.reduce((a, c) => a + c.stats.nodes, 0);

  return (
    <div className="library">
      <header className="lib-head">
        <div>
          <div className="title">Tower library</div>
          <h1>{cards.length} projects <span className="dim">· {total.toLocaleString()} nodes</span></h1>
        </div>
        <label className="search">
          <span className="dim">⌕</span>
          <input autoFocus value={filter} placeholder="Filter projects" onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </label>
        {stack.length > 0 && <button className="btn" onClick={() => showLibrary(false)}>Back to tower ✕</button>}
      </header>
      {tags.length > 0 && (
        <div className="chips lib-tags">
          <button className={`chip clickable ${!tag ? 'on' : ''}`} onClick={() => setTag(undefined)}>ALL</button>
          {tags.map((t) => <button key={t} className={`chip clickable ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? undefined : t)}>{t}</button>)}
        </div>
      )}
      <div className="lib-grid">
        {shown.map(({ id, tower, stats }) => (
          <button key={id} className={`panel lib-card ${stack[0] === id ? 'current' : ''}`} onClick={() => openProject(id)}>
            <MiniTower tower={tower} />
            <div className="lib-body">
              <h3>{tower.name}</h3>
              <p className="dim">{tower.description ?? id}</p>
              <dl className="lib-stats">
                <div title={`${stats.layers} layers including sub-towers`}><dt>Layers</dt><dd>{tower.layers.length}</dd></div>
                <div title="Including sub-towers"><dt>Nodes Σ</dt><dd>{stats.nodes}</dd></div>
                <div><dt>Agents</dt><dd>{stats.agents}</dd></div>
                <div><dt>Sub-towers</dt><dd>{stats.subTowers}{stats.depth > 1 ? ` · d${stats.depth}` : ''}</dd></div>
              </dl>
              <div className="chips">
                {stats.models.map((m) => <span key={m} className="chip">{m}</span>)}
                {stats.errors > 0 && <span className="chip err">{stats.errors} ERR</span>}
                {stats.warnings > 0 && <span className="chip warn">{stats.warnings} WARN</span>}
              </div>
              <div className="mono dim lib-path">{id}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
