import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTower } from '../../core/types';
import { hostsLabel, LIBRARY_FILTER_EVENT, projectMatches, projectStats, recentHosts, sharedLabel, sourceChip, sourceOf, type LibraryFilter, type Stats } from '../library';
import { formatUsage, subtreeState, useLive, usageOf, type LiveState } from '../live';
import { useDescendants } from '../liveHooks';
import { chooseView } from '../settings';
import { useStore } from '../store';
import { RUNTIME_ICON } from '../theme';
import { MicButton } from './Voice';
import { AlertsPill, useHub, WorkingChip } from './Hub';
import { libraryHint, type LibraryHintKind } from '../libraryHint';

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
const TOP_TAGS = 12;
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

/** Machines that recently sent events for each project (sub-towers included), polled every second; re-renders only on change. */
function useProjectsHosts(projects: string[], active: boolean) {
  const desc = useDescendants();
  const [hosts, setHosts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const nodes = useLive.getState().nodes;
      const now = Date.now();
      const next = Object.fromEntries(projects.map((p) => [p, hostsLabel(recentHosts(nodes, new Set([p, ...(desc.get(p) ?? [])]), now))]));
      setHosts((prev) => (projects.every((p) => prev[p] === next[p]) ? prev : next));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [projects, desc, active]);
  return hosts;
}

/** Which machines the hub lists as online (#91), refreshed every 30 s while the library is open. Errors leave no dot. */
const SATELLITES_MS = 30_000;
function useOnlineMachines(active: boolean) {
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    const ac = new AbortController();
    const read = async () => {
      try {
        const res = await fetch('/api/hub/satellites', { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const rows = (await res.json()) as { sender: string; online: boolean }[];
        setOnline(new Set(rows.filter((r) => r.online).map((r) => r.sender)));
      } catch {
        // Not a hub, or the hub is down: no dot, and nothing to report.
        if (!ac.signal.aborted) setOnline(new Set());
      }
    };
    void read();
    const t = setInterval(() => void read(), SATELLITES_MS);
    return () => { ac.abort(); clearInterval(t); };
  }, [active]);
  return online;
}

/** The source the URL names (`?source=<id>`), read once on load so a shared link opens the same view. */
function sourceFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('source') ?? undefined;
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
  /** Where the tower file came from (#121c); undefined when the server did not tag it. */
  origin?: 'mine' | 'example';
  /** Tokens and cost reported live for the project and its sub-towers, already formatted (keeps memo cheap). */
  usage?: string;
  /** Machines that sent events for the project in the last 15 minutes, pre-joined ("@a · @b +N"). */
  hosts?: string;
  /** Where the project came from (`workspace.sources`); undefined when the server sent no sources. */
  source?: string;
  /** When the shared folder was last replaced (`workspace.sharedAt`); undefined for a local project. */
  sharedAt?: number;
  onOpen(id: string, view?: 'tower' | 'map'): void;
}

const ORIGIN_TITLE = {
  mine: 'Your own tower (your library)',
  example: 'Shipped example (read-only reference; copy it before editing)',
} as const;

const ProjectCard = memo(function ProjectCard({ id, tower, stats, live, current, view, origin, usage, hosts, source, sharedAt, onOpen }: CardProps) {
  const src = source === undefined ? undefined : sourceChip(source);
  const shared = source === undefined || source === 'local' ? undefined : sharedLabel(sharedAt, source, Date.now());
  const open = (v?: 'tower' | 'map') => (e: { stopPropagation(): void }) => { e.stopPropagation(); onOpen(id, v); };
  return (
    // A plain container (clickable anywhere) with one primary button: a card that is itself a button
    // cannot contain the Tower / Map buttons (axe nested-interactive).
    <article className={`panel lib-card ${current ? 'current' : ''}`} data-card={id} onClick={() => onOpen(id)}>
      <MiniTower tower={tower} />
      <div className="lib-body">
        <h3>
          <button className="lib-main" onClick={open()} title={`Open ${tower.name} (${view} view)`}>
            <span className="lib-name">{tower.name}</span>
          </button>
          {live !== 'idle' && <span className={`live-dot ${live}`} title={`Live: ${LIVE_LABEL[live]}`} />}
          {current && <span className="chip lib-current">open</span>}
          {origin && <span className={`chip lib-origin ${origin}`} title={ORIGIN_TITLE[origin]}>{origin === 'mine' ? 'MINE' : 'EXAMPLE'}</span>}
          {src && <span className={`chip lib-source ${src.cls}`} title={src.title}>{src.label}</span>}
          {shared && (
            <span className="chip lib-shared" title={shared.title}>
              {shared.dot && <span className="lib-fresh" aria-label="Changed in the last 10 minutes" />}
              {shared.text}
            </span>
          )}
        </h3>
        {/* Focusable so keyboard users can scroll a long description (↑ ↓ while it has the focus). */}
        <p className="dim lib-desc" tabIndex={0} aria-label={`About ${tower.name}`}>{tower.description ?? id}</p>
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
        {hosts && <div className="lib-hosts" title="Machines that sent events for this project in the last 15 minutes">{hosts}</div>}
        <footer className="lib-foot">
          <span className="mono dim" title={id}>
            {stats.errors > 0 && <span className="chip err">{stats.errors} ERR</span>}
            {stats.warnings > 0 && <span className="chip warn">{stats.warnings} WARN</span>}
            {ago(stats.updatedAt)}
            {usage && <span className="lib-usage" title="Tokens and cost reported by live telemetry, from the events the local server keeps (the last 2000), sub-towers included"> · {usage}</span>}
          </span>
          <span className="lib-open">
            <button className="btn" onClick={open('tower')} title="Open as a tower (sets the default view)">Tower</button>
            <button className="btn" onClick={open('map')} title="Open as a map (sets the default view)">Map</button>
          </span>
        </footer>
      </div>
    </article>
  );
});

/** Project gallery: every top-level tower found by the CLI, with size, health and live state. */
export function Library() {
  // Narrow subscriptions: a hover or a camera toggle must not redraw every card.
  const workspace = useStore((s) => s.workspace);
  const library = useStore((s) => s.library);
  const stack = useStore((s) => s.stack);
  const view = useStore((s) => s.view);
  const openProject = useStore((s) => s.openProject);
  const showLibrary = useStore((s) => s.showLibrary);
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState<string>();
  const [source, setSource] = useState<string | undefined>(sourceFromUrl);
  const [sort, setSort] = useState<Sort>(loadSort);
  const grid = useRef<HTMLDivElement>(null);

  // The panel accepts a filter from outside it (#145c): the voice agent's library_filter tool
  // dispatches this event after opening the library, so the tools set the same state the user would.
  useEffect(() => {
    const onFilter = (e: Event) => {
      const f = (e as CustomEvent<LibraryFilter>).detail ?? {};
      setFilter(f.query ?? '');
      setTag(f.tag);
      setSource(f.source);
    };
    window.addEventListener(LIBRARY_FILTER_EVENT, onFilter);
    return () => window.removeEventListener(LIBRARY_FILTER_EVENT, onFilter);
  }, []);

  const cards = useMemo(() => (workspace?.projects ?? []).map((id) => ({
    id, tower: workspace!.towers[id], stats: projectStats(workspace!, id), origin: workspace!.origins?.[id],
    source: workspace!.sources ? sourceOf(workspace!, id) : undefined, sharedAt: workspace!.sharedAt?.[id],
  })), [workspace]);
  // Source chips exist only when the server sent sources. An id that names no source shows all (#165).
  const hasSources = workspace?.sources !== undefined;
  const machines = useMemo(() => [...new Set(Object.values(workspace?.sources ?? {}).filter((s) => s !== 'local'))].sort(), [workspace]);
  const activeSource = hasSources && source && (source === 'local' || machines.includes(source)) ? source : undefined;
  // Kept in the URL with replaceState so a filter change does not add a history entry (#165). It names the
  // active source, not the raw state: a `?source=` for a machine that shares nothing now is dropped, since
  // every project is shown and the link should say so. Closed library or no sources: the URL is left alone.
  useEffect(() => {
    if (!library || !hasSources) return;
    const url = new URL(window.location.href);
    if (activeSource) url.searchParams.set('source', activeSource);
    else url.searchParams.delete('source');
    window.history.replaceState(window.history.state, '', url);
  }, [activeSource, library, hasSources]);
  const sourceCount = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of cards) if (c.source) count.set(c.source, (count.get(c.source) ?? 0) + 1);
    return count;
  }, [cards]);
  const online = useOnlineMachines(library && hasSources);
  // Most shared tags first: with many projects the full list is a wall of chips, so show the top ones
  // and expand on demand. The filter box matches every tag anyway.
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of cards) for (const t of c.tower.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [cards]);
  const [allTags, setAllTags] = useState(false);
  const live = useProjectsLive(workspace?.projects ?? NO_PROJECTS, library);
  const usageMap = useLive((s) => s.usage);
  const desc = useDescendants();
  const usage = useMemo(() => Object.fromEntries((workspace?.projects ?? []).flatMap((p) => {
    const u = usageOf(usageMap, new Set([p, ...(desc.get(p) ?? [])]));
    return u ? [[p, formatUsage(u)]] : [];
  })), [usageMap, desc, workspace]);
  const hosts = useProjectsHosts(workspace?.projects ?? NO_PROJECTS, library);
  useEffect(() => { try { localStorage.setItem('flow-tower:library-sort', sort); } catch { /* ignore */ } }, [sort]);
  // Stable, so the memoized cards do not all re-render when one project's live state changes.
  const onOpen = useCallback((id: string, v?: 'tower' | 'map') => {
    openProject(id);
    if (v) chooseView(v);
  }, [openProject]);
  // Read before the early return: hooks must not follow it. origins is filled only by a library serve.
  const hubOn = useHub((s) => !!s.me?.hub);
  if (!library || !workspace) return null;
  const hintKind: LibraryHintKind = workspace.origins ? 'library' : hubOn ? 'hub' : 'plain';

  const shown = cards
    .filter((c) => projectMatches(c.tower, c.id, filter, tag, c.stats.models, c.source ?? 'local', activeSource))
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
            {cards.length} {cards.length === 1 ? 'project' : 'projects'} <span className="dim">· {total.toLocaleString()} nodes</span>
            {liveNow > 0 && <span className="lib-livecount"> · {liveNow} live</span>}
          </h1>
        </div>
        <MicButton />
        {/* Close the library before opening the panel: the overlay would otherwise hide the Hub panel. */}
        <WorkingChip onOpen={() => { showLibrary(false); useHub.getState().show('now'); }} />
        <AlertsPill onOpen={() => { showLibrary(false); useHub.getState().show('alerts'); }} />
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
              if (e.key === 'ArrowDown') { e.preventDefault(); grid.current?.querySelector<HTMLElement>('[data-card] .lib-main')?.focus(); }
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
      {hasSources && (
        <div className="lib-sources">
          {/* Labelled: without it this row reads like a second row of tags (#165). */}
          <span className="lib-row-label mono dim">FROM</span>
          <button className={`chip clickable ${!activeSource ? 'on' : ''}`} onClick={() => setSource(undefined)} title="Show projects from every source">ALL</button>
          {['local', ...machines].map((s) => {
            const chip = sourceChip(s);
            const n = sourceCount.get(s) ?? 0;
            return (
              <button key={s} className={`chip clickable lib-source ${chip.cls} ${activeSource === s ? 'on' : ''}`}
                onClick={() => setSource(activeSource === s ? undefined : s)}
                title={`${chip.title} (click again to clear)`}>
                {s !== 'local' && online.has(s) && <span className="lib-online" title="Online now" />}
                {chip.label}<span className="dim"> {n}</span>
              </button>
            );
          })}
        </div>
      )}
      {tags.length > 0 && (
        <div className="lib-tags">
          <button className={`chip clickable ${!tag ? 'on' : ''}`} onClick={() => setTag(undefined)} title="Show every project">ALL</button>
          {tags.filter(([t], i) => allTags || i < TOP_TAGS || t === tag).map(([t, n]) => (
            <button key={t} className={`chip clickable ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? undefined : t)}
              title={`Only projects tagged "${t}" (click again to clear)`}>{t}{n > 1 && <span className="dim"> {n}</span>}</button>
          ))}
          {tags.length > TOP_TAGS && (
            <button className="chip clickable more" onClick={() => setAllTags((v) => !v)} title={allTags ? 'Show only the most used tags' : 'Show every tag'}>
              {allTags ? 'less' : `+${tags.length - TOP_TAGS}`}
            </button>
          )}
        </div>
      )}
      <div className="lib-grid" ref={grid}>
        {shown.map(({ id, tower, stats, origin, source, sharedAt }) => (
          <ProjectCard key={id} id={id} tower={tower} stats={stats} live={live[id] ?? 'idle'} current={stack[0] === id} view={view} origin={origin} usage={usage[id]} hosts={hosts[id] || undefined} source={source} sharedAt={sharedAt} onOpen={onOpen} />
        ))}
        {shown.length === 0 && <p className="mono dim">No project matches. Clear the filter or the tag.</p>}
      </div>
      <p className="lib-hint mono dim">↑↓←→ move · Enter open · T / M open as tower / map · / filter · Esc back · {libraryHint(hintKind)}</p>
    </div>
  );
}
