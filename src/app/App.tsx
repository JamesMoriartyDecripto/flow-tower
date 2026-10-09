import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useWorkspaceSync } from './api';
import { Controls, Issues, LayerNav, Legend, TopBar } from './hud/Chrome';
import { FileViewer } from './hud/FileViewer';
import { Inspector } from './hud/Inspector';
import { Library } from './hud/Library';
import { LiveFeed } from './hud/LiveFeed';
import { LiveChips } from './hud/LiveChips';
import { useLiveSync } from './live';
import { Effects } from './scene/Effects';
import { TowerScene } from './scene/Tower';
import { FrameDriver } from './scene/frameBudget';
import { findNode, useStore, useTower } from './store';

export function App() {
  useWorkspaceSync();
  useLiveSync();
  useKeyboard();
  const tower = useTower();
  const error = useStore((s) => s.error);
  const selected = useStore((s) => s.selected);
  const quality = useStore((s) => s.quality);
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
        onCreated={(state) => { if (import.meta.env.DEV) Object.assign(window, { __flowTower: state }); }}
      >
        <Suspense fallback={null}>
          <TowerScene />
          <FrameDriver />
          <Effects />
        </Suspense>
      </Canvas>
      <div className="scanlines" />
      <LiveChips />
      <div className="hud">
        <TopBar onIssues={() => setShowIssues((v) => !v)} />
        <LayerNav />
        <Legend />
        <Controls />
        {!selected && (
          <div className="hint">DRAG rotate · SHIFT+DRAG / RIGHT-DRAG pan · SCROLL zoom · SHIFT+SCROLL pan · CLICK inspect · DBL-CLICK enter · 1-9 layers · M map · ESC back</div>
        )}
        <Inspector />
        <LiveFeed />
        {(showIssues || broken) && <Issues onClose={() => setShowIssues(false)} />}
      </div>
      <FileViewer />
      <Library />
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

/** Esc walks back (file → selection → layer focus → parent tower), digits focus layers. */
function useKeyboard() {
  const tower = useTower();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const s = useStore.getState();
      if (s.library) {
        if (e.key === 'Escape' && s.stack.length) s.showLibrary(false);
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        s.showLibrary(true);
      } else if (e.key === 'Escape') {
        if (s.file) s.openFile(undefined);
        else if (s.selected) s.select(undefined);
        else if (s.focusedLayer !== undefined) s.resetView();
        else if (s.stack.length > 1) s.goTo(s.stack.length - 2);
      } else if (e.key === 'Backspace' && s.stack.length > 1) {
        s.goTo(s.stack.length - 2);
      } else if (e.key === 'm' || e.key === 'M') {
        s.set({ view: s.view === 'map' ? 'tower' : 'map' });
        s.resetView();
      } else if (e.key === '0') {
        s.resetView();
      } else if (/^[1-9]$/.test(e.key) && tower && Number(e.key) <= tower.layers.length) {
        s.focusLayer(Number(e.key) - 1);
      } else if (e.key === 'Enter') {
        const node = findNode(tower, s.selected);
        if (node?.tower) s.enterTower(node.tower);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tower]);
}
