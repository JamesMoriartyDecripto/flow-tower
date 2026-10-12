import { useRef } from 'react';
import { create } from 'zustand';
import { useStore } from '../store';
import { useDialogFocus } from './dialog';

/** Open flag of the PDF menu: the PDF button and the D key both open it. */
export const usePdfMenu = create<{ open: boolean; show(open: boolean): void }>()((set) => ({
  open: false,
  show: (open) => set({ open }),
}));

const LEVELS: [1 | 2 | 3, string][] = [
  [1, 'Images — one page per layer'],
  [2, 'Overview — tables of layers and nodes'],
  [3, 'Full documentation — every node, nested towers'],
];

/** The library entry: shown only when the workspace has more than one project, since one project is no library. */
const LIBRARY_ENTRY = 'Library — every project, overview level';

/** Picks the level of the document; it always covers the root project, not the sub-tower on screen. */
export function PdfMenu() {
  const open = usePdfMenu((s) => s.open);
  const root = useStore((s) => s.stack[0]);
  const projectCount = useStore((s) => s.workspace?.projects.length ?? 0);
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, open, '.pdf-menu-list button');
  if (!open || !root) return null;
  const close = () => usePdfMenu.getState().show(false);
  const pick = (level: 1 | 2 | 3 | 4) => {
    // print=1 makes the document page open the print dialog once it is ready. The library is every project.
    const q = new URLSearchParams(level === 4 ? { doc: 'library', level: '4', print: '1' } : { doc: root, level: String(level), print: '1' });
    // A new tab, so the 3D view stays where it is; noopener keeps the document page isolated.
    window.open(`${location.pathname}?${q}`, '_blank', 'noopener');
    close();
  };
  return (
    <div className="overlay" onClick={close}>
      <div className="panel shortcuts" ref={panel} role="dialog" aria-modal="true" aria-label="Documentation as PDF" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="title">Documentation as PDF</div>
          <button className="close" onClick={close} title="Close (Esc or D)">✕</button>
        </header>
        <div className="pdf-menu-list">
          {LEVELS.map(([level, label]) => (
            <button key={level} className="btn" onClick={() => pick(level)}>{label}</button>
          ))}
          {projectCount > 1 && <button className="btn" onClick={() => pick(4)}>{LIBRARY_ENTRY}</button>}
        </div>
      </div>
    </div>
  );
}
