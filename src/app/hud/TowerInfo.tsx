import { useMemo } from 'react';
import { projectStats } from '../library';
import { formatUsage, usageOf, useLive } from '../live';
import { useDescendants } from '../liveHooks';
import { usePrefs } from '../settings';
import { useStore, useTower } from '../store';
import { RUNTIME_ICON } from '../theme';

/**
 * Right panel at Tower overview: the tower's own card (the facts its library card shows), in the place
 * the node list takes inside a layer. It can be reduced to its title bar; the choice is remembered, so
 * the card stays as the user left it when they come back. It is the sub-tower's card inside a sub-tower.
 */
export function TowerInfo() {
  const tower = useTower();
  const { focusedLayer, selected, workspace } = useStore();
  const open = usePrefs((s) => s.towerInfo);
  const usageMap = useLive((s) => s.usage);
  const desc = useDescendants();
  // Same facts and classes as the library card, so the two read the same. Memoized: the stats walk the whole subtree.
  const stats = useMemo(() => (workspace && tower ? projectStats(workspace, tower.id) : undefined), [workspace, tower]);
  // Live usage of the tower and its sub-towers, as the library card computes it for one project.
  const usage = useMemo(() => {
    if (!tower) return undefined;
    const u = usageOf(usageMap, new Set([tower.id, ...(desc.get(tower.id) ?? [])]));
    return u ? formatUsage(u) : undefined;
  }, [usageMap, desc, tower]);
  if (!tower || !stats || focusedLayer !== undefined || selected) return null;
  return (
    <aside className={`panel towerinfo${open ? '' : ' reduced'}`} aria-label={`About ${tower.name}`}>
      <div className="title">
        <span className="towerinfo-name">{tower.name}</span>
        <button
          className="towerinfo-toggle"
          aria-expanded={open}
          title={open ? 'Reduce the tower card' : 'Show the tower card'}
          onClick={() => usePrefs.getState().set({ towerInfo: !open })}
        >
          {open ? '–' : '+'}
        </button>
      </div>
      {open && (
        <div className="panel-scroll">
          {tower.description && <p className="dim towerinfo-desc" tabIndex={0}>{tower.description}</p>}
          {tower.tags.length > 0 && (
            <div className="lib-cardtags">
              {tower.tags.map((t) => <span key={t}>#{t}</span>)}
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
          {(stats.errors > 0 || stats.warnings > 0 || usage) && (
            <footer className="towerinfo-foot">
              {stats.errors > 0 && <span className="chip err">{stats.errors} ERR</span>}
              {stats.warnings > 0 && <span className="chip warn">{stats.warnings} WARN</span>}
              {usage && <span className="lib-usage" title="Tokens and cost reported by live telemetry, from the events the local server keeps (the last 2000), sub-towers included"> {usage}</span>}
            </footer>
          )}
        </div>
      )}
    </aside>
  );
}
