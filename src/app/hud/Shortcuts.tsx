import { useRef } from 'react';
import { usePrefs } from '../settings';
import { useDialogFocus } from './dialog';

const GROUPS: [string, [string, string][]][] = [
  ['Navigate', [
    ['← → ↑ ↓', 'Move to the nearest node; ↑ ↓ cross to the layer above / below'],
    ['PgUp PgDn', 'Previous / next layer'],
    ['1 – 9', 'Focus a layer'],
    ['0', 'Overview of the whole tower'],
    ['Enter', 'Select the first node of the layer · open the node panel · enter a sub-tower'],
    ['C  Shift+C', 'Jump to the next / previous connected node (any layer)'],
    ['B', 'Back to the node you jumped from'],
    ['Esc', 'Back: file → node → layer → parent tower'],
    ['S  Shift+S', 'Next / previous node with a sub-tower · Enter dives in'],
    ['Backspace', 'Up to the parent tower, back on the node you entered from'],
    ['Shift+Backspace', 'Up to the project root'],
  ]],
  ['Camera', [
    ['Shift + arrows', 'Orbit'],
    ['Alt + arrows', 'Pan'],
    ['+  −', 'Zoom in / out'],
    ['M', 'Tower ⇄ Map view (kept for sub-towers)'],
    ['O', 'Auto-orbit on / off'],
    ['P', 'Download the 3D view as PNG'],
    ['X', 'Download the focused layer (or all layers) as SVG'],
    ['W  V', 'File viewer: wrap long lines · Markdown formatted / source'],
  ]],
  ['Panels', [
    ['/', 'Search nodes, models, tools'],
    ['I', 'Into the node panel: ↑ ↓ sections and buttons, ← → tabs, Enter press, Esc back to the scene'],
    ['[  ]', 'Previous / next tab of the selected node'],
    ['F', 'Live feed'],
    ['L', 'Library (arrows move, Enter opens, T / M open as tower / map)'],
    [',', 'Settings'],
    ['?', 'This help'],
    ['Tab', 'Move between HUD buttons · Enter / Space press them'],
    ['↑ ↓  Home End', 'Inside any panel (layers, feed, files): walk its items'],
  ]],
];

/** Keyboard reference (press ?). */
export function Shortcuts() {
  const help = usePrefs((s) => s.help);
  const panel = useRef<HTMLDivElement>(null);
  // Focus on the panel itself: ↑ ↓ PageDown scroll it on short screens.
  useDialogFocus(panel, help);
  if (!help) return null;
  const close = () => usePrefs.getState().set({ help: false });
  return (
    <div className="overlay" onClick={close}>
      <div className="panel shortcuts" ref={panel} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="title">Keyboard</div>
          <button className="close" onClick={close} title="Close (Esc or ?)">✕</button>
        </header>
        <div className="keys">
          {GROUPS.map(([title, keys]) => (
            <section key={title}>
              <h3>{title}</h3>
              <dl>
                {keys.map(([k, what]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>)}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
