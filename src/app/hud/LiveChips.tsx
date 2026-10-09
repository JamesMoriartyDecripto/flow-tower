import { useMemo } from 'react';
import { targetKey } from '../../core/events';
import { useLive } from '../live';
import { useCurrentTowerLive } from '../liveHooks';
import { findNode, useStore } from '../store';
import { chipEls } from '../scene/chips';
import { usePrefs } from '../settings';

const MAX_CHIPS = 14;

/**
 * DOM chips ("label · tool") floating above running / failing nodes. Rendered once in the HUD;
 * the scene's chip projector positions them every frame. Errors first, then the focused layer.
 */
export function LiveChips() {
  const { tower, states } = useCurrentTowerLive();
  const focused = useStore((s) => s.focusedLayer);
  const feedOpen = useLive((s) => s.feedOpen);
  const chipsOn = usePrefs((s) => s.chips);

  const keys = useMemo(() => {
    if (!tower) return [];
    const focusId = focused === undefined ? undefined : tower.layers[focused]?.id;
    return [...states]
      .filter(([key, st]) => (st === 'run' || st === 'error') && (!focusId || key.startsWith(`${focusId}.`)))
      .sort(([, a], [, b]) => (a === 'error' ? -1 : 0) - (b === 'error' ? -1 : 0))
      .slice(0, MAX_CHIPS)
      .map(([key, st]) => ({ key, error: st === 'error' }));
  }, [tower, states, focused]);

  if (!tower || !feedOpen || !chipsOn) return null;
  return (
    <div className="live-chips">
      {keys.map(({ key, error }) => (
        <Chip key={key} liveKey={targetKey(tower.id, key)} nodeKey={key} label={findNode(tower, key)?.label ?? key} error={error} />
      ))}
    </div>
  );
}

function Chip({ liveKey, nodeKey, label, error }: { liveKey: string; nodeKey: string; label: string; error: boolean }) {
  const last = useLive((s) => s.nodes.get(liveKey)?.last);
  const what = last?.tool ?? (last?.kind === 'agent.start' ? 'working' : last?.kind) ?? 'inside sub-tower';
  return (
    <button
      ref={(el) => { if (el) chipEls.set(nodeKey, el); else chipEls.delete(nodeKey); }}
      className={`live-chip ${error ? 'error' : 'run'}`}
      style={{ visibility: 'hidden' }}
      onClick={() => useStore.getState().select(nodeKey)}
      title={last?.message}
    >
      <i>{error ? '✕' : '◆'}</i>
      <b>{label}</b>
      <span>{what}</span>
    </button>
  );
}
