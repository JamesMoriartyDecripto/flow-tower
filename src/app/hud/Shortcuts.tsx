import { usePrefs } from '../settings';

const GROUPS: [string, [string, string][]][] = [
  ['Navigate', [
    ['← → ↑ ↓', 'Move to the nearest node; ↑ ↓ cross to the layer above / below'],
    ['PgUp PgDn', 'Previous / next layer'],
    ['1 – 9', 'Focus a layer'],
    ['0', 'Overview of the whole tower'],
    ['Enter', 'Select the first node of the layer · enter a sub-tower'],
    ['Esc', 'Back: file → node → layer → parent tower'],
    ['Backspace', 'Parent tower'],
  ]],
  ['Camera', [
    ['Shift + arrows', 'Orbit'],
    ['Alt + arrows', 'Pan'],
    ['+  −', 'Zoom in / out'],
    ['M', 'Tower ⇄ Map view (kept for sub-towers)'],
    ['O', 'Auto-orbit on / off'],
  ]],
  ['Panels', [
    ['/', 'Search nodes, models, tools'],
    ['[  ]', 'Previous / next tab of the selected node'],
    ['F', 'Live feed'],
    ['L', 'Library (arrows move, Enter opens, T / M open as tower / map)'],
    [',', 'Settings'],
    ['?', 'This help'],
    ['Tab', 'Move between HUD buttons · Enter / Space press them'],
  ]],
];

/** Keyboard reference (press ?). */
export function Shortcuts() {
  const help = usePrefs((s) => s.help);
  if (!help) return null;
  const close = () => usePrefs.getState().set({ help: false });
  return (
    <div className="overlay" onClick={close}>
      <div className="panel shortcuts" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
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
