import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useWorkspaceSync } from './api';
import { Controls, Issues, LayerNav, Legend, TopBar } from './hud/Chrome';
import { FileViewer } from './hud/FileViewer';
import { Inspector } from './hud/Inspector';
import { Library } from './hud/Library';
import { LiveFeed } from './hud/LiveFeed';
import { LiveChips } from './hud/LiveChips';
import { Settings } from './hud/Settings';
import { Shortcuts } from './hud/Shortcuts';
import { cycleConnection, jumpBack } from './hud/Connections';
import { focusInspector, panelKey, panelOf } from './hud/focusNav';
import { Tooltip } from './hud/Tooltip';
import { NodeList } from './hud/NodeList';
import { VoiceCaption } from './hud/Voice';
import { useVoice } from './voice/voice';
import { chooseView, usePrefs, viewFor } from './settings';
import { useLive, useLiveSync } from './live';
import { useDemoSimulator } from './demo';
import { exportPng, exportSvg } from './exporter';
import { Snapshot } from './scene/Snapshot';
import { navigate, nextSubTower, nudgeCamera, stepLayer, type Dir } from './keynav';
import { Effects } from './scene/Effects';
import { TowerScene } from './scene/Tower';
import { FrameDriver } from './scene/frameBudget';
import { findNode, useStore, useTower } from './store';

export function App() {
  useWorkspaceSync();
  useLiveSync();
  useDemoSimulator();
  useKeyboard();
  const tower = useTower();
  const error = useStore((s) => s.error);
  const selected = useStore((s) => s.selected);
  const quality = useStore((s) => s.quality);
  const themeRev = usePrefs((s) => s.themeRev);
  const hints = usePrefs((s) => s.hints);
  const feedOpen = useLive((s) => s.feedOpen);
  useDefaultView();
  const [showIssues, setShowIssues] = useState(false);
  const broken = tower && tower.layers.length === 0;

  return (
    <>
      <Canvas
        dpr={quality === 'high' ? [1, 2] : 1}
        camera={{ fov: 42, near: 0.1, far: 2000, position: [40, 30, 60] }}
        gl={{ antialias: quality === 'eco', powerPreference: 'high-performance' }}
        frameloop="demand"
        onPointerMissed={() => useStore.getState().select(undefined)}
        onCreated={(state) => { if (import.meta.env.DEV) Object.assign(window, { __flowTower: { store: useStore, three: state, voice: (text: string) => useVoice.getState().run(text) } }); }}
      >
        <Suspense fallback={null}>
          <TowerScene key={themeRev} />
          <FrameDriver />
          <Effects />
          <Snapshot />
        </Suspense>
      </Canvas>
      <div className="scanlines" />
      <LiveChips />
      <div className="hud">
        <TopBar onIssues={() => setShowIssues((v) => !v)} />
        <LayerNav />
        <Legend />
        <Controls />
        {!selected && hints && !feedOpen && (
          <div className="hint">DRAG rotate · SHIFT+DRAG pan · SCROLL zoom · CLICK inspect · DBL-CLICK enter · ARROWS move · M map · ESC back · ? all keys</div>
        )}
        <Inspector />
        <NodeList />
        <LiveFeed />
        {(showIssues || broken) && <Issues onClose={() => setShowIssues(false)} />}
      </div>
      <FileViewer />
      <Settings />
      <Shortcuts />
      <Tooltip />
      <Library />
      <VoiceCaption />
      {!tower && (
        <div className="boot">
          <div>
            <div className="title">{error ? 'Link failure' : 'Initializing tower'}</div>
            <p>{error ?? 'Resolving agents, prompts and flows…'}</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Applies the default view (tower / map / auto by complexity) whenever another tower comes on screen. */
function useDefaultView() {
  const tower = useTower();
  useEffect(() => {
    if (!tower) return;
    const view = viewFor(usePrefs.getState().defaultView, tower.layers.length);
    if (new URLSearchParams(location.search).has('view')) return;
    useStore.getState().set({ view });
  }, [tower?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

const ARROWS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/** Library: arrows move between cards from anywhere, T / M open the focused card as tower / map. */
function libraryKey(e: KeyboardEvent) {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-card]')];
  const active = document.activeElement as HTMLElement | null;
  // Focus may be on any control inside a card (title, description, Tower / Map).
  const i = active ? cards.findIndex((c) => c.contains(active)) : -1;
  const focusCard = (c?: HTMLElement) => c?.querySelector<HTMLElement>('.lib-main')?.focus();
  // A focused description scrolls with ↑ ↓; ← → still move between cards.
  if (active?.matches('.lib-desc') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
  if (e.key in ARROWS) {
    e.preventDefault();
    if (i < 0) return focusCard(document.querySelector<HTMLElement>('.lib-card.current') ?? cards[0]);
    const cols = cards.filter((c) => c.offsetTop === cards[0].offsetTop).length || 1;
    const step = { left: -1, right: 1, up: -cols, down: cols }[ARROWS[e.key]];
    // ← → wrap around the ends; ↑ ↓ stop at the first / last row.
    const next = Math.abs(step) === 1 ? (i + step + cards.length) % cards.length : Math.min(cards.length - 1, Math.max(0, i + step));
    focusCard(cards[next]);
  } else if (e.key === '/') {
    e.preventDefault();
    document.querySelector<HTMLInputElement>('.lib-head input')?.focus();
  } else if (i >= 0 && (e.key === 't' || e.key === 'm')) {
    cards[i].querySelectorAll<HTMLElement>('.lib-open .btn')[e.key === 't' ? 0 : 1]?.click();
  }
}

/** The whole app from the keyboard: see the ? overlay (hud/Shortcuts.tsx) for the full map. */
function useKeyboard() {
  const tower = useTower();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Typing in a text field must not trigger shortcuts; sliders keep their arrows.
      if (t instanceof HTMLInputElement && (t.type !== 'range' || e.key in ARROWS)) return;
      // A focused HUD button keeps Enter / Space for itself.
      if ((e.key === 'Enter' || e.key === ' ') && t.closest('button, [role="button"], a')) return;
      if (e.metaKey || e.ctrlKey) return;
      const s = useStore.getState();
      const prefs = usePrefs.getState();
      if (e.key === '?') { prefs.set({ help: !prefs.help }); return; }
      if (prefs.help) { if (e.key === 'Escape') prefs.set({ help: false }); return; }
      if (prefs.open) { if (e.key === 'Escape') prefs.set({ open: false }); return; }
      if (e.key === ',') { e.preventDefault(); prefs.set({ open: true }); return; }
      if (s.library) {
        if (e.key === 'Escape' && s.stack.length) s.showLibrary(false);
        else if (e.key === 'v' || e.key === 'V') useVoice.getState().toggle();
        else libraryKey(e);
        return;
      }
      // Focus inside a HUD panel: arrows walk the panel, Esc returns to the scene.
      const panel = panelOf(t);
      if (panel) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (s.file) s.openFile(undefined);
          else t.blur();
          return;
        }
        if (panelKey(panel, e)) { e.preventDefault(); return; }
        if (e.key === 'PageUp' || e.key === 'PageDown') return; // native scrolling of the panel
      }
      const dir = ARROWS[e.key];
      if (dir && tower) {
        e.preventDefault();
        if (e.shiftKey) nudgeCamera('orbit', dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
        else if (e.altKey) nudgeCamera('pan', dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
        else navigate(tower, dir);
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'l') {
        e.preventDefault(); // the library focuses its filter: do not type the "l" into it
        s.showLibrary(true);
      } else if (key === 'Escape') {
        if (s.file) s.openFile(undefined);
        else if (s.selected) s.select(undefined);
        else if (s.focusedLayer !== undefined) s.resetView();
        else if (s.stack.length > 1) s.goTo(s.stack.length - 2);
      } else if (key === 'Backspace' && s.stack.length > 1) {
        s.goTo(e.shiftKey ? 0 : s.stack.length - 2);
      } else if (key === 's' && tower) {
        nextSubTower(tower, e.shiftKey ? -1 : 1);
      } else if (key === 'PageUp' || key === 'PageDown') {
        e.preventDefault();
        if (tower) stepLayer(tower, key === 'PageDown' ? 1 : -1);
      } else if (key === 'm') {
        chooseView(s.view === 'map' ? 'tower' : 'map');
      } else if (key === 'o') {
        s.set({ autoRotate: !s.autoRotate });
      } else if (key === 'v') {
        useVoice.getState().toggle();
      } else if (key === 'f') {
        useLive.getState().toggleFeed();
      } else if (key === '+' || key === '=') {
        nudgeCamera('zoom', 1);
      } else if (key === '-' || key === '_') {
        nudgeCamera('zoom', -1);
      } else if (key === '[' || key === ']') {
        window.dispatchEvent(new CustomEvent('flow-tower:tab', { detail: key === ']' ? 1 : -1 }));
      } else if (key === '0') {
        s.resetView();
      } else if (/^[1-9]$/.test(key) && tower && Number(key) <= tower.layers.length) {
        s.focusLayer(Number(key) - 1);
      } else if (key === 'Enter' && tower) {
        const node = findNode(tower, s.selected);
        if (node?.tower) s.enterTower(node.tower);
        else if (node) focusInspector();
        else navigate(tower, 'right');
      } else if (key === 'i' && s.selected) {
        focusInspector();
      } else if (key === 'c' && tower) {
        cycleConnection(tower, e.shiftKey ? -1 : 1);
      } else if (key === 'b' && tower) {
        jumpBack(tower);
      } else if (key === 'p' && tower) {
        void exportPng();
      } else if (key === 'x' && tower) {
        void exportSvg();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tower]);
}
