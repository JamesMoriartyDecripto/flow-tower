import { useMemo, useState } from 'react';
import type { FlowEvent } from '../../core/events';
import { useLive } from '../live';
import { findNode, useStore, useTower } from '../store';

const ICON: Record<string, string> = {
  'session.start': '▶', 'session.end': '■', prompt: '❯', 'agent.start': '◆', 'agent.end': '◇',
  'tool.start': '⚙', 'tool.end': '✓', error: '✕', log: '·', usage: '$',
};

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour12: false });

/** Scrolling list of live events; click one to jump to the node it landed on. */
export function LiveFeed() {
  const { events, feedOpen, toggleFeed, clear } = useLive();
  const tower = useTower();
  const inspecting = useStore((s) => !!s.selected);
  const [scope, setScope] = useState<'tower' | 'all'>('tower');

  const rows = useMemo(() => {
    const prefix = tower ? `${tower.id}#` : '';
    const list = scope === 'all' ? events : events.filter((e) => e.targets.some((t) => t.startsWith(prefix)));
    return [...list].reverse().slice(0, 150);
  }, [events, scope, tower]);
  const sources = useMemo(() => [...new Set(events.map((e) => e.source))], [events]);
  if (!feedOpen) return null;

  const labelOf = (e: FlowEvent) => {
    const key = e.targets.find((t) => tower && t.startsWith(`${tower.id}#`))?.split('#')[1];
    return findNode(tower, key)?.label;
  };
  const jump = (e: FlowEvent) => {
    const key = tower && e.targets.find((t) => t.startsWith(`${tower.id}#`))?.split('#')[1];
    const node = findNode(tower, key);
    if (!tower || !node) return;
    const s = useStore.getState();
    s.select(node.key);
    if (s.focusedLayer !== undefined) s.focusLayer(tower.layers.findIndex((l) => l.id === node.layer));
  };

  return (
    <aside className={`panel livefeed ${inspecting ? 'shifted' : ''}`}>
      <header>
        <span className="title">Live feed · {events.length}</span>
        <div className="chips">
          <button className={`chip clickable ${scope === 'tower' ? 'on' : ''}`} onClick={() => setScope('tower')}>This tower</button>
          <button className={`chip clickable ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')}>All</button>
          <button className="chip clickable" onClick={clear} title="Clear the feed and node states">Clear</button>
          <button className="chip clickable" onClick={() => toggleFeed(false)}>✕</button>
        </div>
      </header>
      {sources.length > 0 && <div className="mono dim feed-sources">sources: {sources.join(' · ')}</div>}
      <div className="feed">
        {rows.length === 0 && (
          <p className="mono dim">No events yet. Connect an agent (docs/realtime.md) or run <b>npm run simulate</b>.</p>
        )}
        {rows.map((e) => (
          <button key={e.id} className={`feed-row ${e.status === 'error' || e.kind === 'error' ? 'err' : ''} ${e.targets.length ? '' : 'unmapped'}`} onClick={() => jump(e)}>
            <span className="t">{time(e.ts)}</span>
            <span className="k" title={e.kind}>{ICON[e.kind] ?? '·'}</span>
            <span className="who">
              {[e.agent, e.tool].filter(Boolean).join(' → ') || labelOf(e) || e.source}
              {e.targets.length === 0 && <em> unmapped</em>}
            </span>
            {e.message && <span className="msg">{e.message}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}

/** Live section of the inspector for the selected node. */
export function NodeLiveInfo({ nodeKey }: { nodeKey: string }) {
  const tower = useTower();
  useLive((s) => s.version); // re-render on new events
  const live = tower ? useLive.getState().nodes.get(`${tower.id}#${nodeKey}`) : undefined;
  if (!live || !findNode(tower, nodeKey)) return null;
  return (
    <div className="section">
      <span className="title">Live</span>
      <dl className="kv">
        <dt>state</dt><dd>{live.open > 0 ? `running (${live.open})` : 'idle'}</dd>
        <dt>events</dt><dd>{live.count}</dd>
        <dt>last</dt><dd>{live.last ? `${time(live.last.ts)} · ${live.last.kind}${live.last.tool ? ` · ${live.last.tool}` : ''}` : '—'}</dd>
        {live.last?.message && <><dt>message</dt><dd>{live.last.message}</dd></>}
        {live.errorTs > 0 && <><dt>last error</dt><dd style={{ color: 'var(--error)' }}>{time(live.errorTs)}</dd></>}
      </dl>
    </div>
  );
}
