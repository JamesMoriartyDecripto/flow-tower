import { useEffect, useRef, useState } from 'react';
import { EDGE_KINDS, NODE_TYPES } from '../../core/schema';
import { search as rank } from '../graph';
import { useStore, useTower } from '../store';
import { EDGE_STYLE, NODE_STYLE } from '../theme';

/** Logo, breadcrumb through nested towers, search, validation badge and live-reload indicator. */
export function TopBar({ onIssues }: { onIssues(): void }) {
  const tower = useTower();
  const { workspace, stack, search, revision, goTo, set, showLibrary } = useStore();
  const [flash, setFlash] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (revision < 2) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [revision]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const issues = tower?.issues ?? [];
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;

  const jump = () => {
    const hit = rank(tower?.layers.flatMap((l) => l.nodes) ?? [], search)[0];
    if (!hit || !tower) return;
    const s = useStore.getState();
    s.select(hit.key);
    s.focusLayer(tower.layers.findIndex((l) => l.id === hit.layer));
  };

  return (
    <header className="panel topbar">
      <div className="logo">FLOW<b>//</b>TOWER</div>
      {(workspace?.projects.length ?? 0) > 1 && (
        <button className="btn" onClick={() => showLibrary(true)} title="Project library (L)">▦ Library {workspace!.projects.length}</button>
      )}
      <nav className="crumbs">
        {stack.map((id, i) => (
          <span key={id} style={{ display: 'contents' }}>
            {i > 0 && <span className="sep">›</span>}
            <button onClick={() => goTo(i)}>{workspace?.towers[id]?.name ?? id}</button>
          </span>
        ))}
      </nav>
      <label className="search">
        <span className="dim">⌕</span>
        <input
          ref={input}
          value={search}
          placeholder="Search nodes, models, tools"
          onChange={(e) => set({ search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') jump();
            if (e.key === 'Escape') { set({ search: '' }); input.current?.blur(); }
            e.stopPropagation();
          }}
        />
        <kbd>/</kbd>
      </label>
      <button className="issues-btn" onClick={onIssues} title="Validation issues">
        <span className={`chip ${errors ? 'err' : ''}`}>{errors} ERR</span>
        <span className={`chip ${warnings ? 'warn' : ''}`}>{warnings} WARN</span>
      </button>
      <div className={`live ${flash ? 'flash' : ''}`} title="Live reload: edit the YAML and the tower updates"><i />LIVE</div>
    </header>
  );
}

export function LayerNav() {
  const tower = useTower();
  const { focusedLayer, hoveredLayer, focusLayer, hoverLayer, resetView } = useStore();
  if (!tower) return null;
  return (
    <nav className="panel layernav">
      <div className="title">Layers</div>
      <button className={focusedLayer === undefined ? 'on' : ''} onClick={resetView}>
        <span className="idx">◈</span><span className="name">Tower overview</span><span className="count">{tower.layers.length}L</span>
      </button>
      {tower.layers.map((l) => (
        <button
          key={l.id}
          className={`${focusedLayer === l.index ? 'on' : ''} ${hoveredLayer === l.index ? 'hot' : ''}`}
          onClick={() => focusLayer(l.index)}
          onMouseEnter={() => hoverLayer(l.index)}
          onMouseLeave={() => hoverLayer(undefined)}
          title={l.description}
        >
          <span className="idx">L{String(l.index + 1).padStart(2, '0')}</span>
          <span className="name">{l.title}</span>
          <span className="count">{l.nodes.length}</span>
        </button>
      ))}
    </nav>
  );
}

const RUNTIME_ICON: Record<string, string> = {
  local: '⌂', server: '▤', cloud: '☁', container: '▣', serverless: 'λ', saas: '◎', edge: '◇', ci: '⟳', browser: '◫', device: '▯',
};

/** Bottom-left key: node types (click to hide), edge kinds, and runtimes (click to spotlight). */
export function Legend() {
  const tower = useTower();
  const { hiddenTypes, toggleType, runtimeFocus, set } = useStore();
  const [tab, setTab] = useState<'types' | 'edges' | 'runtimes'>('types');
  const runtimes = Object.values(tower?.runtimes ?? {});
  const counts = new Map<string, number>();
  for (const l of tower?.layers ?? []) for (const n of l.nodes) if (n.runtime) counts.set(n.runtime.id, (counts.get(n.runtime.id) ?? 0) + 1);

  return (
    <aside className="panel legend">
      <nav className="legend-tabs">
        <button className={tab === 'types' ? 'on' : ''} onClick={() => setTab('types')}>Types</button>
        <button className={tab === 'edges' ? 'on' : ''} onClick={() => setTab('edges')}>Edges</button>
        <button className={tab === 'runtimes' ? 'on' : ''} disabled={!runtimes.length} onClick={() => setTab('runtimes')}>
          Runtimes{runtimes.length ? ` ${runtimes.length}` : ''}
        </button>
      </nav>
      {tab === 'types' && (
        <div className="grid">
          {NODE_TYPES.map((t) => (
            <button key={t} className={hiddenTypes.has(t) ? 'off' : ''} onClick={() => toggleType(t)} title={NODE_STYLE[t].hint}>
              <span className="tag">{NODE_STYLE[t].tag}</span>{t}
            </button>
          ))}
        </div>
      )}
      {tab === 'edges' && (
        <div className="grid">
          {EDGE_KINDS.map((k) => (
            <span key={k} className="edge" title={EDGE_STYLE[k].hint}>
              <span className="swatch" style={{
                borderTopStyle: EDGE_STYLE[k].dashed ? 'dashed' : 'solid',
                borderTopWidth: Math.max(1, EDGE_STYLE[k].width),
                borderTopColor: k === 'call' || k === 'return' || k === 'data' ? 'var(--white)' : k === 'spawn' ? 'var(--amber)' : 'var(--orange)',
              }} />
              {k}
            </span>
          ))}
          <span className="edge" title="Node status other than active"><span className="swatch" style={{ borderTopStyle: 'dashed', borderTopColor: 'var(--amber)' }} />planned / exp.</span>
        </div>
      )}
      {tab === 'runtimes' && (
        <div className="runtimes">
          {runtimes.map((r) => (
            <button key={r.id} className={runtimeFocus === r.id ? 'on' : ''} onClick={() => set({ runtimeFocus: runtimeFocus === r.id ? undefined : r.id })}
              title={[r.description, r.host, r.provider, r.region].filter(Boolean).join(' · ')}>
              <span className="tag">{RUNTIME_ICON[r.kind]} {r.kind.toUpperCase()}</span>
              <span className="name">{r.label ?? r.id}</span>
              <span className="count">{counts.get(r.id) ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export function Controls() {
  const { explode, autoRotate, particles, quality, set, resetView } = useStore();
  const next = { high: 'balanced', balanced: 'low', low: 'high' } as const;
  return (
    <div className="panel controls">
      <label>EXPLODE<input type="range" min={0.4} max={2.5} step={0.05} value={explode} onChange={(e) => set({ explode: Number(e.target.value) })} /></label>
      <button className={`btn ${autoRotate ? 'on' : ''}`} onClick={() => set({ autoRotate: !autoRotate })}>Orbit</button>
      <button className={`btn ${particles ? 'on' : ''}`} onClick={() => set({ particles: !particles })}>Flow</button>
      <button className="btn" onClick={() => set({ quality: next[quality] })} title="Rendering quality: high / balanced / low">FX {quality}</button>
      <button className="btn" onClick={resetView}>Reset</button>
    </div>
  );
}

export function Issues({ onClose }: { onClose(): void }) {
  const tower = useTower();
  const issues = [...(tower?.issues ?? [])].sort((a, b) => ['error', 'warning', 'info'].indexOf(a.level) - ['error', 'warning', 'info'].indexOf(b.level));
  return (
    <aside className="panel issues">
      <button className="close" style={{ position: 'absolute', top: 10, right: 18 }} onClick={onClose}>✕</button>
      <div className="title" style={{ marginBottom: 10 }}>Validation · {issues.length}</div>
      {issues.length === 0 && <p className="mono dim">All systems nominal.</p>}
      {issues.map((i, k) => (
        <div key={k} className="issue">
          <span className={`lvl-${i.level}`}>{i.level.toUpperCase()}</span>
          <span>{i.path && <span className="dim">{i.path} · </span>}{i.message}</span>
        </div>
      ))}
    </aside>
  );
}
