import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTower, Workspace } from '../../core/types';
import { subtreeState, useLive, type LiveState } from '../live';
import { useDescendants } from '../liveHooks';
import { chooseView } from '../settings';
import { useStore } from '../store';
import { RUNTIME_ICON } from '../theme';

interface Stats {
  layers: number;
  nodes: number;
  agents: number;
  links: number;
  subTowers: number;
  depth: number;
  models: string[];
  runtimes: [string, number][];
  errors: number;
  warnings: number;
  updatedAt?: string;
}

/** Aggregates a project and every tower nested below it. */
export function projectStats(ws: Workspace, id: string): Stats {
  const s: Stats = { layers: 0, nodes: 0, agents: 0, links: 0, subTowers: 0, depth: 0, models: [], runtimes: [], errors: 0, warnings: 0 };
  const models = new Set<string>();
  const kinds = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const visit = (tid: string, depth: number) => {
    const t = ws.towers[tid];
    if (!t || seen.has(tid)) return;
    seen.add(tid);
    s.depth = Math.max(s.depth, depth);
    if (depth > 0) s.subTowers++;
    if (t.updatedAt && (!s.updatedAt || t.updatedAt > s.updatedAt)) s.updatedAt = t.updatedAt;
    for (const i of t.issues) { if (i.level === 'error') s.errors++; if (i.level === 'warning') s.warnings++; }
    for (const r of Object.values(t.runtimes)) kinds.set(r.kind, (kinds.get(r.kind) ?? new Set()).add(r.id));
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
  s.runtimes = [...kinds].map(([k, ids]) => [k, ids.size] as [string, number]).sort((a, b) => b[1] - a[1]);
  return s;
}

/** "5 min ago", "3 h ago", "2 d ago", or a date. */
function ago(iso?: string) {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  if (min < 30 * 24 * 60) return `${Math.round(min / 1440)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Stacked plates drawn in SVG: a thumbnail of the tower's shape. */
const MiniTower = memo(function MiniTower({ tower }: { tower: ResolvedTower }) {
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
});

const NO_PROJECTS: string[] = [];
const LIVE_LABEL: Partial<Record<LiveState, string>> = { run: 'running', error: 'error', done: 'active', flash: 'active' };

/** Live state per project (incl. nested towers), polled every second; re-renders only on change. */
function useProjectsLive(projects: string[], active: boolean) {
  const desc = useDescendants();
  const [states, setStates] = useState<Record<string, LiveState>>({});
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const nodes = useLive.getState().nodes;
      const now = Date.now();
      const next = Object.fromEntries(projects.map((p) => [p, subtreeState(new Set([p, ...(desc.get(p) ?? [])]), nodes, now).state]));
      setStates((prev) => (projects.every((p) => prev[p] === next[p]) ? prev : next));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [projects, desc, active]);
  return states;
}

type Sort = 'updated' | 'name' | 'size' | 'live';
const SORTS: [Sort, string, string][] = [
  ['updated', 'Recent', 'Most recently modified tower files first'],
  ['name', 'Name', 'Alphabetical'],
  ['size', 'Size', 'Most nodes first (sub-towers included)'],
  ['live', 'Live', 'Projects with live activity first'],
];
const LIVE_RANK: Record<LiveState, number> = { error: 4, run: 3, done: 2, flash: 1, idle: 0 };

function loadSort(): Sort {
  try { return (localStorage.getItem('flow-tower:library-sort') as Sort | null) ?? 'updated'; } catch { return 'updated'; }
}

interface CardProps {
  id: string;
  tower: ResolvedTower;
  stats: Stats;
  live: LiveState;
  current: boolean;
  view: 'tower' | 'map';
  onOpen(id: string, view?: 'tower' | 'map'): void;
}

const ProjectCard = memo(function ProjectCard({ id, tower, stats, live, current, view, onOpen }: CardProps) {
  const open = (v?: 'tower' | 'map') => (e: { stopPropagation(): void }) => { e.stopPropagation(); onOpen(id, v); };
  return (
    <div
      className={`panel lib-card ${current ? 'current' : ''}`}
      role="button"
      tabIndex={0}
      data-card={id}
      onClick={() => onOpen(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } }}
      title={`Open ${tower.name} (${view} view)`}
    >
      <MiniTower tower={tower} />
      <div className="lib-body">
        <h3>
          <span className="lib-name">{tower.name}</span>
          {live !== 'idle' && <span className={`live-dot ${live}`} title={`Live: ${LIVE_LABEL[live]}`} />}
          {current && <span className="chip lib-current">open</span>}
        </h3>
        <p className="dim lib-desc">{tower.description ?? id}</p>
        {tower.tags.length > 0 && (
          <div className="lib-cardtags">
            {tower.tags.slice(0, 4).map((t) => <span key={t}>#{t}</span>)}
            {tower.tags.length > 4 && <span className="dim">+{tower.tags.length - 4}</span>}
          </div>
        )}
        <dl className="lib-stats">
          <div title={`${stats.layers} layers including sub-towers`}><dt>Layers</dt><dd>{tower.layers.length}</dd></div>
          <div title="All nodes, sub-towers included"><dt>Nodes</dt><dd>{stats.nodes}</dd></div>
          <div title="LLM agents, sub-towers included"><dt>Agents</dt><dd>{stats.agents}</dd></div>
          <div title={`${stats.subTowers} nested towers, max depth ${stats.depth}`}><dt>Subs</dt><dd>{stats.subTowers}</dd></div>
        </dl>
        <div className="lib-meta">
          {stats.models.length > 0 && <span className="lib-models" title="Models used">{stats.models.join(' · ')}</span>}
          {stats.runtimes.length > 0 && (
            <span className="lib-runtimes" title={stats.runtimes.map(([k, n]) => `${n} ${k}`).join(', ')}>
              {stats.runtimes.slice(0, 5).map(([k, n]) => <span key={k}>{RUNTIME_ICON[k]}{n}</span>)}
            </span>
          )}
        </div>
        <footer className="lib-foot">
          <span className="mono dim" title={id}>
            {stats.errors > 0 && <span className="chip err">{stats.errors} ERR</span>}
            {stats.warnings > 0 && <span className="chip warn">{stats.warnings} WARN</span>}
            {ago(stats.updatedAt)}
          </span>
          <span className="lib-open">
            <button className="btn" onClick={open('tower')} title="Open as a tower (sets the default view)">Tower</button>
            <button className="btn" onClick={open('map')} title="Open as a map (sets the default view)">Map</button>
          </span>
        </footer>
      </div>
    </div>
  );
});

/** Project gallery: every top-level tower found by the CLI, with size, health and live state. */
export function Library() {
  const { workspace, library, stack, view, openProject, showLibrary } = useStore();
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState<string>();
  const [sort, setSort] = useState<Sort>(loadSort);
  const grid = useRef<HTMLDivElement>(null);

  const cards = useMemo(() => (workspace?.projects ?? []).map((id) => ({
    id, tower: workspace!.towers[id], stats: projectStats(workspace!, id),
  })), [workspace]);
  const tags = useMemo(() => [...new Set(cards.flatMap((c) => c.tower.tags))].sort(), [cards]);
  const live = useProjectsLive(workspace?.projects ?? NO_PROJECTS, library);
  useEffect(() => { try { localStorage.setItem('flow-tower:library-sort', sort); } catch { /* ignore */ } }, [sort]);
  if (!library || !workspace) return null;

  const onOpen = (id: string, v?: 'tower' | 'map') => {
    openProject(id);
    if (v) chooseView(v);
  };
  const q = filter.trim().toLowerCase();
  const shown = cards
    .filter((c) => (!tag || c.tower.tags.includes(tag)) &&
      (!q || [c.tower.name, c.tower.description, c.id, ...c.tower.tags, ...c.stats.models].some((v) => v?.toLowerCase().includes(q))))
    .sort((a, b) => sort === 'name' ? a.tower.name.localeCompare(b.tower.name)
      : sort === 'size' ? b.stats.nodes - a.stats.nodes
      : sort === 'live' ? LIVE_RANK[live[b.id] ?? 'idle'] - LIVE_RANK[live[a.id] ?? 'idle']
      : (b.stats.updatedAt ?? '').localeCompare(a.stats.updatedAt ?? ''));
  const total = cards.reduce((a, c) => a + c.stats.nodes, 0);
  const liveNow = Object.values(live).filter((s) => s === 'run' || s === 'error').length;

  return (
    <div className="library">
      <header className="lib-head">
        <div>
          <div className="title">Tower library</div>
          <h1>
            {cards.length} projects <span className="dim">· {total.toLocaleString()} nodes</span>
            {liveNow > 0 && <span className="lib-livecount"> · {liveNow} live</span>}
          </h1>
        </div>
        <label className="search" title="Filter by name, description, tag or model">
          <span className="dim">⌕</span>
          <input
            autoFocus
            value={filter}
            placeholder="Filter projects"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              // The filter has focus while the library is open: Esc clears it first, then closes.
              if (e.key === 'ArrowDown') { e.preventDefault(); grid.current?.querySelector<HTMLElement>('[data-card]')?.focus(); }
              if (e.key !== 'Escape') return;
              if (filter) setFilter('');
              else if (stack.length) showLibrary(false);
            }}
          />
        </label>
        <div className="seg" title="Sort projects">
          {SORTS.map(([s, label, hint]) => <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)} title={hint}>{label}</button>)}
        </div>
        {stack.length > 0 && <button className="btn" onClick={() => showLibrary(false)} title="Close the library and return to the tower you were viewing (Esc)">Back ✕</button>}
      </header>
      {tags.length > 0 && (
        <div className="lib-tags">
          <button className={`chip clickable ${!tag ? 'on' : ''}`} onClick={() => setTag(undefined)} title="Show every project">ALL</button>
          {tags.map((t) => (
            <button key={t} className={`chip clickable ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? undefined : t)}
              title={`Only projects tagged "${t}" (click again to clear)`}>{t}</button>
          ))}
        </div>
      )}
      <div className="lib-grid" ref={grid}>
        {shown.map(({ id, tower, stats }) => (
          <ProjectCard key={id} id={id} tower={tower} stats={stats} live={live[id] ?? 'idle'} current={stack[0] === id} view={view} onOpen={onOpen} />
        ))}
        {shown.length === 0 && <p className="mono dim">No project matches. Clear the filter or the tag.</p>}
      </div>
      <p className="lib-hint mono dim">↑↓←→ move · Enter open · T / M open as tower / map · / filter · Esc back · add projects: flow-tower &lt;dir&gt; scans every *.tower.yaml</p>
    </div>
  );
}
