import { useState } from 'react';
import { STATIC } from '../staticData';
import { shareMode, shareOf, shareStatus, type TowerShare } from '../sharing';
import { useStore } from '../store';
import { shareProject, unshareTower, useSatellite, useShares } from './Sharing';

type Mode = 'off' | 'towers' | 'files';

const OPTIONS: [Mode, string][] = [
  ['off', 'Not shared'],
  ['towers', 'Share: towers only'],
  ['files', 'Share: towers and files'],
];

// What leaves the machine, as the user reads it on hover. Secrets and the user folder never leave in either mode.
const SHARE_TITLE = 'Towers only sends the *.tower.yaml files. Towers and files also sends the files they reference, never secrets or the user folder.';

/**
 * The stop confirmation names the whole share: one share covers every project in its folder, so the other
 * projects are named too, since they stop with it.
 */
function stopQuestion(share: TowerShare, id: string): string {
  const ws = useStore.getState().workspace;
  const others = share.projects.filter((p) => p !== id).map((p) => ws?.towers[p]?.name ?? p);
  const also = others.length > 0 ? ` It also stops ${others.join(', ')}.` : '';
  return `Stop sharing ${share.name} with the hub? The hub removes its copy.${also}`;
}

/**
 * Share control on a library card (#266): share this project with the hub, re-share it in the other mode, or
 * stop. Shown only on a satellite, and only for a project that is local to this machine (a remote tower's folder
 * is not on this machine to send). Every click and change stops here, so the card's own click (open the tower)
 * does not fire.
 */
export function ShareControl({ id, name, source }: { id: string; name: string; source?: string }) {
  const satellite = useSatellite();
  const shares = useShares();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (STATIC || !satellite || (source !== undefined && source !== 'local')) return null;

  const share: TowerShare | undefined = shareOf(shares, id);
  const mode = shareMode(share);
  const status = share ? shareStatus(share, Date.now()) : undefined;

  const change = (next: Mode) => {
    // Stopping is the one destructive step: the hub removes its copy, so the user confirms it first.
    if (next === 'off') {
      if (!share) return;
      if (!window.confirm(stopQuestion(share, id))) return;
    }
    setBusy(true);
    setError(undefined);
    const run = next === 'off' ? unshareTower(share!.name) : shareProject(id, next === 'files');
    void run.then((f) => setError(f?.error)).finally(() => setBusy(false));
  };

  // A stop on the wrapper keeps the card's onClick (open the tower) from firing for any click or change inside.
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  return (
    <span className="share-control" onClick={stop} onChange={stop}>
      <select
        aria-label={`Share ${name} with the hub`}
        title={SHARE_TITLE}
        value={mode}
        disabled={busy}
        onChange={(e) => change(e.target.value as Mode)}
      >
        {OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {error && <span className="share-error" role="alert">{error}</span>}
      {!error && status && <span className={`chip share-chip ${status.tone}`} title={status.title}>{status.text}</span>}
    </span>
  );
}
