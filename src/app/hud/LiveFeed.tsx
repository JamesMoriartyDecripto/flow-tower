import { memo, useCallback, useMemo, useState } from 'react';
import { splitTarget, type FlowEvent } from '../../core/events';
import { towerPath } from '../graph';
import { formatUsage, useLive, usageOf } from '../live';
import { useDescendants } from '../liveHooks';
import { findNode, useStore, useTower } from '../store';

const ICON: Record<string, string> = {
  'session.start': '▶', 'session.end': '■', prompt: '❯', 'agent.start': '◆', 'agent.end': '◇',
  'tool.start': '⚙', 'tool.end': '✓', error: '✕', log: '·', usage: '$',
};

type Filter = 'all' | 'run' | 'error';

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
/** HH:MM:SS. toLocaleTimeString with options builds an Intl formatter per call: far too slow per row. */
export const time = (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const isError = (e: FlowEvent) => e.status === 'error' || e.kind === 'error';
const isStart = (e: FlowEvent) => e.kind === 'tool.start' || e.kind === 'agent.start';
/** Row tone, same palette as the 3D overlay: cyan running, green done, red error. */
const tone = (e: FlowEvent) => (isError(e) ? 'error' : isStart(e) ? 'run' : e.kind.endsWith('.end') ? 'done' : 'info');

/** Live feed: color-coded events, filters, pause, spotlight/follow toggles, jump to any tower. */
export function LiveFeed() {
  // Closed: subscribe to nothing else, so incoming events cost no render and no filtering.
  return useLive((s) => s.feedOpen) ? <FeedPanel /> : null;
}

function FeedPanel() {
  const { events, spotlight, follow, paused, toggleFeed, setOption, clear } = useLive();
  const tower = useTower();
  const ws = useStore((s) => s.workspace);
  const inspecting = useStore((s) => !!s.selected);
  const listing = useStore((s) => !s.selected && s.focusedLayer !== undefined);
  const [scope, setScope] = useState<'tower' | 'all'>('tower');
  const usageMap = useLive((s) => s.usage);
  const desc = useDescendants();
  // Tokens and cost of this tower and its sub-towers, from usage events (OpenTelemetry and adapters).
  const usage = useMemo(() => (tower ? usageOf(usageMap, new Set([tower.id, ...(desc.get(tower.id) ?? [])])) : undefined), [usageMap, desc, tower]);
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const prefix = tower ? `${tower.id}#` : '';
    return [...events].reverse().filter((e) =>
      (scope === 'all' || e.targets.some((t) => t.startsWith(prefix))) &&
      (filter === 'all' || (filter === 'error' ? isError(e) : isStart(e)))).slice(0, 150);
  }, [events, scope, filter, tower]);
  const errors = useMemo(() => events.filter(isError).length, [events]);
  /** Where an event lands: prefer the tower on screen, otherwise its first target anywhere. */
  const where = useCallback((e: FlowEvent) => {
    const t = (tower && e.targets.find((x) => x.startsWith(`${tower.id}#`))) ?? e.targets[0];
    if (!t || !ws) return undefined;
    const [towerId, key] = splitTarget(t);
    return { towerId, key, node: findNode(ws.towers[towerId], key), here: towerId === tower?.id, towerName: ws.towers[towerId]?.name };
  }, [tower, ws]);
  const jump = useCallback((e: FlowEvent) => {
    const w = where(e);
    if (!w?.node || !ws) return;
    const s = useStore.getState();
    if (w.here) {
      s.select(w.key);
      if (s.focusedLayer !== undefined) s.focusLayer(tower!.layers.findIndex((l) => l.id === w.node!.layer));
      return;
    }
    const path = towerPath(ws, w.towerId);
    if (path) s.openPath(path, w.key);
  }, [where, tower, ws]);

  return (
    <aside className={`panel livefeed ${inspecting ? 'shifted' : listing ? 'beside-list' : ''}`}>
      <header>
        <span className="title">Live · {events.length}{errors ? <em className="err-count"> · {errors} err</em> : null}</span>
        {usage && <span className="feed-usage mono" title={`Reported by live telemetry, from the events the local server keeps (the last 2000), for this tower and its sub-towers: ${usage.calls} model calls`}>{formatUsage(usage)}</span>}
        <button className="chip clickable" onClick={() => toggleFeed(false)} title="Close (the scene keeps showing activity)">✕</button>
      </header>
      <div className="feed-tools">
        <div className="seg">
          {(['all', 'run', 'error'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)} title={f === 'all' ? 'Show every event' : f === 'run' ? 'Only starts of agents and tools' : 'Only errors'}>{f === 'run' ? 'Starts' : f === 'error' ? 'Errors' : 'All'}</button>
          ))}
        </div>
        <div className="seg">
          <button className={scope === 'tower' ? 'on' : ''} onClick={() => setScope('tower')} title="Only events that land in the tower on screen">Tower</button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} title="Events from every project and nested tower (click one to go there)">Library</button>
        </div>
        <button className={`chip clickable ${spotlight ? 'on' : ''}`} onClick={() => setOption({ spotlight: !spotlight })} title="Dim everything that is not live">Spotlight</button>
        <button className={`chip clickable ${follow ? 'on' : ''}`} onClick={() => setOption({ follow: !follow })} title="Camera follows the layer of the latest event">Follow</button>
        <button className={`chip clickable ${paused ? 'on' : ''}`} onClick={() => setOption({ paused: !paused })} title="Freeze the list (the tower keeps updating)">{paused ? 'Resume' : 'Pause'}</button>
        <button className="chip clickable" onClick={clear} title="Clear the feed and node states">Clear</button>
      </div>
      <div className="feed-legend">
        <span className="run">● running</span><span className="done">● done</span><span className="error">● error</span><span className="dim">○ unmapped</span>
      </div>
      <div className="feed">
        {rows.length === 0 && (
          <p className="mono dim">No events{filter !== 'all' ? ' for this filter' : ''}. Connect an agent (docs/realtime.md) or run <b>npm run simulate</b>.</p>
        )}
        {rows.map((e) => {
          const w = where(e);
          return <FeedRow key={e.id} e={e} label={w?.node?.label} away={w && !w.here ? w.towerName : undefined} mapped={!!w} onJump={jump} />;
        })}
      </div>
    </aside>
  );
}

/** One feed line. Memoized: when an event arrives only the new rows render. */
const FeedRow = memo(function FeedRow({ e, label, away, mapped, onJump }: {
  e: FlowEvent; label?: string; away?: string; mapped: boolean; onJump(e: FlowEvent): void;
}) {
  return (
    <button className={`feed-row ${tone(e)} ${mapped ? '' : 'unmapped'}`} onClick={() => onJump(e)} title={mapped ? 'Select the node this event landed on' : 'No node matched this event: add a match: rule (docs/realtime.md)'}>
      <span className="t">{time(e.ts)}</span>
      <span className="k" title={e.kind}>{ICON[e.kind] ?? '·'}</span>
      <span className="who">
        {[e.agent, e.tool].filter(Boolean).join(' → ') || label || e.source}
        {away && <em> ↗ {away}</em>}
        {!mapped && <em> unmapped</em>}
      </span>
      {e.message && <span className="msg" title={e.message}>{e.message}</span>}
      {/* Who ran it and where: small chips, so a line stays readable even with long messages. */}
      {(e.host || e.user) && (
        <span className="feed-chips">
          {e.host && <span className="chip" title={`host: ${e.host}`}>{e.host}</span>}
          {e.user && <span className="chip" title={`user: ${e.user}`}>@{e.user}</span>}
        </span>
      )}
    </button>
  );
}, (a, b) => a.e === b.e && a.label === b.label && a.away === b.away && a.mapped === b.mapped && a.onJump === b.onJump);

/** Live section of the inspector for the selected node. */
export function NodeLiveInfo({ nodeKey }: { nodeKey: string }) {
  const tower = useTower();
  useLive((s) => s.version); // re-render on new events
  const live = tower ? useLive.getState().nodes.get(`${tower.id}#${nodeKey}`) : undefined;
  if (!live || !findNode(tower, nodeKey)) return null;
  const where = live.where;
  // runtimeRef points at a runtime declared by the tower; its label reads better than the raw id.
  const runtime = where && (tower?.runtimes?.[where.runtimeRef ?? '']?.label ?? where.runtime ?? where.runtimeRef);
  // "Running now on claude-code · gpu-1 · user ada"
  const parts = [runtime, where?.host, where?.user && `user ${where.user}`].filter(Boolean).join(' · ');
  return (
    <div className="section">
      <span className="title">Live</span>
      <dl className="kv">
        <dt>state</dt><dd className={live.open > 0 ? 'live-run' : ''}>{live.open > 0 ? `running (${live.open})` : 'idle'}</dd>
        {/* Where the node ran last: whatever the last event that named a user, host or runtime said. */}
        {where && parts && <><dt>where</dt><dd>Running now on {parts} <span className="dim">· {time(where.ts)}</span></dd></>}
        <dt>events</dt><dd>{live.count}</dd>
        <dt>last</dt><dd>{live.last ? `${time(live.last.ts)} · ${live.last.kind}${live.last.tool ? ` · ${live.last.tool}` : ''}` : '—'}</dd>
        {live.last?.message && <><dt>message</dt><dd>{live.last.message}</dd></>}
        {live.errorTs > 0 && <><dt>last error</dt><dd className="live-error">{time(live.errorTs)}</dd></>}
        {live.usage && <><dt>usage</dt><dd>{live.estimated ? '≈ ' : ''}{formatUsage(live.usage)} · {live.usage.calls} model calls</dd></>}
      </dl>
    </div>
  );
}
