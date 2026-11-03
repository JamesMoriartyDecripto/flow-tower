import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import './phone.css';

/** The HUD panels a phone shows one at a time, as a bottom sheet (#436a). */
export type PhoneSheet = 'layers' | 'info' | 'legend';

const TABS: [PhoneSheet, string][] = [['layers', 'Layers'], ['info', 'Info'], ['legend', 'Legend']];

/** Tab bar above the controls, shown on phones only (see phone.css). Tapping the open tab closes its sheet. */
export function PhoneTabs({ sheet, onSheet }: { sheet?: PhoneSheet; onSheet(s?: PhoneSheet): void }) {
  const focusedLayer = useStore((s) => s.focusedLayer);
  const selected = useStore((s) => s.selected);
  const first = useRef(true);
  // Picking a layer or a node should show the tower, so the sheet closes. The first render is skipped: it is not a pick.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onSheet(undefined);
  }, [focusedLayer, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav className="panel phone-tabs" aria-label="Panels">
      {TABS.map(([id, label]) => (
        <button key={id} className={sheet === id ? 'on' : ''} aria-pressed={sheet === id}
          onClick={() => onSheet(sheet === id ? undefined : id)}>{label}</button>
      ))}
    </nav>
  );
}
