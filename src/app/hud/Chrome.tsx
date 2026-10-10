import { useEffect, useRef, useState } from 'react';
import { EDGE_KINDS, NODE_TYPES } from '../../core/schema';
import { search as rank } from '../graph';
import { useLive } from '../live';
import { chooseView, usePrefs } from '../settings';
import { useDemo } from '../demo';
import { exportPng, exportSvg, useExport } from '../exporter';
import { budgetsText, limitsText } from '../ops';
import { STATIC } from '../staticData';
import { useCurrentTowerLive } from '../liveHooks';
import { useStore, useTower } from '../store';
import { EDGE_STYLE, NODE_STYLE, RUNTIME_ICON } from '../theme';

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
      if (e.key !== '/' || e.metaKey || e.ctrlKey || document.activeElement === input.current) return;
      // Dialogs on top (settings, shortcuts, file viewer, library) keep their keys.
      const prefs = usePrefs.getState();
      const s = useStore.getState();
      if (prefs.open || prefs.help || s.file || s.library) return;
      e.preventDefault();
      input.current?.focus();
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
            <button onClick={() => goTo(i)} title={i === stack.length - 1 ? 'Current tower' : 'Go back up to this tower (Backspace)'}>{workspace?.towers[id]?.name ?? id}</button>
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
      <DemoChip />
      <UpdateChip />
      <LiveButton flash={flash} />
      <button className="btn gear" onClick={() => usePrefs.getState().set({ open: true })} title="Settings (,)">⚙</button>
    </header>
  );
}

interface Version { current: string; latest?: string; url?: string; newer: boolean; command?: string }

/** A newer release on GitHub (checked by the local server once a day, see src/server/update.ts). */
function UpdateChip() {
  const [v, setV] = useState<Version>();
  useEffect(() => {
    if (STATIC) return;
    // The server checks in the background: ask again shortly after start, then leave it.
    const get = () => fetch('/api/version').then((r) => (r.ok ? r.json() : undefined)).then(setV).catch(() => {});
    void get();
    const t = setTimeout(get, 4000);
    return () => clearTimeout(t);
  }, []);
  if (!v?.newer || !v.url) return null;
  return (
    <a className="btn update-chip" href={v.url} target="_blank" rel="noopener noreferrer"
      title={`Flow Tower ${v.latest} is available (you have v${v.current}). Opens the release notes.${v.command ? ' Update: git pull && npm install in your flow-tower folder (the exact command is in the terminal).' : ''}`}>
      ↑ {v.latest}
    </a>
  );
}

/** Static demo only: the live events are simulated in the browser; click to pause or resume them. */
function DemoChip() {
  const { on, toggle } = useDemo();
  if (!STATIC) return null;
  return (
    <button className={`btn demo-chip ${on ? 'on' : ''}`} onClick={toggle}
      title={on ? 'Demo: live events are simulated in your browser. Click to pause them.' : 'Demo: simulated live events are paused. Click to resume.'}>
      DEMO · SIM {on ? 'ON' : 'OFF'}
    </button>
  );
}

/** LIVE indicator: flashes on file reloads and incoming events; click to open the live feed. */
function LiveButton({ flash }: { flash: boolean }) {
  const { events, feedOpen, toggleFeed } = useLive();
  const perMin = events.filter((e) => e.ts > Date.now() - 60_000).length;
  const last = events[events.length - 1]?.id;
  // Re-keying the dot restarts its CSS ping animation on every event: no React state, no effect.
  return (
    <button className={`live ${flash ? 'flash' : ''} ${feedOpen ? 'on' : ''}`} onClick={() => toggleFeed()}
      title="Live: file reloads + agent events. Click for the live feed.">
      <i key={last} className={last ? 'ping' : ''} />LIVE{perMin ? ` ${perMin}/min` : ''}
    </button>
  );
}

export function LayerNav() {
  const tower = useTower();
  const { focusedLayer, hoveredLayer, focusLayer, hoverLayer, resetView } = useStore();
  const { states } = useCurrentTowerLive();
  if (!tower) return null;
  // Per layer: how many nodes are running, and whether any failed recently.
  const liveOf = (layerId: string) => {
    let run = 0;
    let error = false;
    for (const [key, st] of states) if (key.startsWith(`${layerId}.`)) { if (st === 'run') run++; if (st === 'error') error = true; }
    return { run, error };
  };
  return (
    <nav className="panel layernav">
      <div className="title">Layers</div>
      {tower.run && (
        <div className="run-limits mono" title={`One run of the whole system, across every node: ${[budgetsText(tower.run.budget), limitsText(tower.run.limits)].filter(Boolean).join(' · ')}`}>
          RUN · {[budgetsText(tower.run.budget, true), limitsText(tower.run.limits, true)].filter(Boolean).join(' · ')}
        </div>
      )}
      <button className={focusedLayer === undefined ? 'on' : ''} onClick={resetView} title="Show the whole tower (0)">
        <span className="idx">◈</span><span className="name">Tower overview</span><span className="count">{tower.layers.length}L</span>
      </button>
      {tower.layers.map((l) => (
        <button
          key={l.id}
          className={`${focusedLayer === l.index ? 'on' : ''} ${hoveredLayer === l.index ? 'hot' : ''}`}
          onClick={() => focusLayer(l.index)}
          onMouseEnter={() => hoverLayer(l.index)}
          onMouseLeave={() => hoverLayer(undefined)}
          onFocus={() => hoverLayer(l.index)}
          onBlur={() => hoverLayer(undefined)}
          title={`${l.title}: focus this layer (${l.index < 9 ? l.index + 1 : 'click'})${l.description ? ` — ${l.description}` : ''}`}
        >
          <span className="idx">L{String(l.index + 1).padStart(2, '0')}</span>
          <span className="name">{l.title}</span>
          <LiveCount {...liveOf(l.id)} total={l.nodes.length} />
        </button>
      ))}
      <SubTowers />
    </nav>
  );
}


/** Every node of the current tower that opens its own tower: click selects it, ⇣ dives in. */
function SubTowers() {
  const tower = useTower();
  const ws = useStore((s) => s.workspace);
  const subs = (tower?.layers ?? []).flatMap((l) => l.nodes.filter((n) => n.tower).map((n) => ({ n, l })));
  if (!tower || !subs.length) return null;
  const pick = (layer: number, key: string) => {
    const s = useStore.getState();
    s.select(key);
    s.focusLayer(layer);
  };
  return (
    <div className="subtowers">
      <div className="title">Sub-towers · {subs.length}</div>
      {subs.map(({ n, l }) => (
        <div key={n.key} className="sub">
          <button onClick={() => pick(l.index, n.key)} title={`Select ${n.label} (layer ${l.index + 1}) — it opens "${ws?.towers[n.tower!]?.name ?? n.tower}"`} className="sub-pick">
            <span className="idx">L{String(l.index + 1).padStart(2, '0')}</span>
            <span className="name">{n.label}</span>
          </button>
          <button className="enter-btn" onClick={() => useStore.getState().enterTower(n.tower!)} title={`Enter "${ws?.towers[n.tower!]?.name ?? n.tower}"`}>⇣</button>
        </div>
      ))}
    </div>
  );
}

/** Node count, or a pulsing live badge when agents on the layer are working (red if one failed). */
function LiveCount({ run, error, total }: { run: number; error: boolean; total: number }) {
  if (!run && !error) return <span className="count">{total}</span>;
  return <span className={`count live-badge ${error ? 'error' : 'run'}`} title={`${run} running${error ? ', recent error' : ''}`}>● {run || '!'}</span>;
}

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
        <button className={tab === 'types' ? 'on' : ''} onClick={() => setTab('types')} title="Node types: click a type to hide or show it">Types</button>
        <button className={tab === 'edges' ? 'on' : ''} onClick={() => setTab('edges')} title="What each edge style means">Edges</button>
        <button className={tab === 'runtimes' ? 'on' : ''} disabled={!runtimes.length} onClick={() => setTab('runtimes')} title={runtimes.length ? 'Where things run: click one to spotlight its nodes' : 'This tower declares no runtimes'}>
          Runtimes{runtimes.length ? ` ${runtimes.length}` : ''}
        </button>
      </nav>
      {tab === 'types' && (
        <>
          <div className="grid">
            {NODE_TYPES.map((t) => (
              <button key={t} className={hiddenTypes.has(t) ? 'off' : ''} onClick={() => toggleType(t)} title={NODE_STYLE[t].hint}>
                <span className="tag">{NODE_STYLE[t].tag}</span>{t}
              </button>
            ))}
          </div>
          <div className="sub-key" title="Nodes with stacked plates (and ⇣ SUB in their subtitle) contain their own tower. Double-click, press Enter, or use ⇣ in the Layers panel.">
            <span>▤ ⇣ SUB</span><span className="dim">sub-tower · double-click to enter</span>
          </div>
        </>
      )}
      {tab === 'edges' && (
        <div className="grid">
          {EDGE_KINDS.map((k) => (
            <span key={k} className="edge" tabIndex={0} title={EDGE_STYLE[k].hint}>
              <span className="swatch" style={{
                borderTopStyle: EDGE_STYLE[k].dashed ? 'dashed' : 'solid',
                borderTopWidth: Math.max(1, EDGE_STYLE[k].width),
                borderTopColor: k === 'call' || k === 'return' || k === 'data' ? 'var(--white)' : k === 'spawn' ? 'var(--amber)' : 'var(--orange)',
              }} />
              {k}
            </span>
          ))}
          <span className="edge" tabIndex={0} title="Node status other than active"><span className="swatch" style={{ borderTopStyle: 'dashed', borderTopColor: 'var(--amber)' }} />planned / exp.</span>
        </div>
      )}
      {tab === 'runtimes' && (
        <div className="runtimes">
          {runtimes.map((r) => (
            <button key={r.id} className={runtimeFocus === r.id ? 'on' : ''} onClick={() => set({ runtimeFocus: runtimeFocus === r.id ? undefined : r.id })}
              title={`Spotlight nodes running here (click again to clear)${[r.description, r.host, r.provider, r.region].some(Boolean) ? ` — ${[r.description, r.host, r.provider, r.region].filter(Boolean).join(' · ')}` : ''}`}>
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
  const { explode, autoRotate, particles, quality, view, set, resetView } = useStore();
  const { busy, done, total } = useExport();
  const progress = total ? ` ${done}/${total}` : '…';
  const next = { high: 'eco', balanced: 'high', eco: 'balanced' } as const;
  return (
    <div className="panel controls">
      <label title={view === 'map' ? 'Layer spacing applies to tower view only' : 'Vertical spacing between layers'}>EXPLODE<input type="range" min={0.4} max={2.5} step={0.05} value={explode} disabled={view === 'map'} onChange={(e) => set({ explode: Number(e.target.value) })} /></label>
      <div className="seg view-seg" title="Tower: stacked layers. Map: side by side, seen from above (M)">
        <button className={view === 'tower' ? 'on' : ''} onClick={() => chooseView('tower')} title="Tower view: layers stacked vertically (M to switch)">Tower</button>
        <button className={view === 'map' ? 'on' : ''} onClick={() => chooseView('map')} title="Map view: layers side by side, seen from above (M to switch)">Map</button>
      </div>
      <button className={`btn ${autoRotate ? 'on' : ''}`} onClick={() => set({ autoRotate: !autoRotate })} disabled={view === 'map'} title={view === 'map' ? 'Orbit is only available in tower view' : 'Slowly rotate the camera around the tower'}>Orbit</button>
      <button className={`btn ${particles ? 'on' : ''}`} onClick={() => set({ particles: !particles })} title="Show or hide the dots travelling along the edges (needs ambient animations)">Flow</button>
      <button className="btn" onClick={() => set({ quality: next[quality] })} title="Rendering: eco (20 fps cap, no post-processing) / balanced (30 fps) / high (60 fps, full effects)">FX {quality}</button>
      <button className="btn" onClick={resetView} title="Reset the camera to the overview (0)">Reset</button>
      <button className="btn" onClick={() => void exportPng()} disabled={!!busy} title="Download a ZIP of Full HD PNGs: every layer, the map of each tower and its sub-towers, and the 3D view (P)">{busy === 'png' ? `PNG${progress}` : 'PNG'}</button>
      <button className="btn" onClick={() => void exportSvg()} disabled={!!busy} title="Download a ZIP of editable SVG diagrams: every layer and the map of each tower and its sub-towers (X)">{busy === 'svg' ? `SVG${progress}` : 'SVG'}</button>
    </div>
  );
}

export function Issues({ onClose }: { onClose(): void }) {
  const tower = useTower();
  const inspecting = useStore((s) => !!s.selected);
  const issues = [...(tower?.issues ?? [])].sort((a, b) => ['error', 'warning', 'info'].indexOf(a.level) - ['error', 'warning', 'info'].indexOf(b.level));
  return (
    <aside className={`panel issues ${inspecting ? 'shifted' : ''}`}>
      <button className="close" style={{ position: 'absolute', top: 10, right: 18 }} onClick={onClose} title="Close the validation panel">✕</button>
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
