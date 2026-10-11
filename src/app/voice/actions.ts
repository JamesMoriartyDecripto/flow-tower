import { towerPath } from '../graph';
import { useHub } from '../hud/Hub';
import { chooseView } from '../settings';
import { findNode, useStore } from '../store';
import type { VoiceAction } from './commands';
import { runItsFile, runStep } from './referents';

/** The event the viewer listens for; the agent tool dispatches the same one (#145b). */
export const SCROLL_EVENT = 'flow-tower:viewer-scroll';

/** The caption text for a transcript the parser could not turn into anything. */
export const NOT_UNDERSTOOD = 'Not understood';

/**
 * What execute needs from the module that owns the listening session. Passed in rather than imported:
 * voice.ts imports execute, so importing stop() back would close an import cycle.
 */
export interface ActionDeps {
  /** Turns the microphone off ("spegni il microfono"). */
  stop(): void;
}

/** Applies an action with the same store calls as the keyboard; returns what it did, for the widget. */
export function execute(a: VoiceAction, { stop }: ActionDeps): string {
  const s = useStore.getState();
  const ws = s.workspace!;
  const tower = ws.towers[s.stack[s.stack.length - 1]];
  switch (a.kind) {
    case 'library': s.showLibrary(true); return 'Library';
    case 'tower': {
      const path = towerPath(ws, a.id);
      if (!path) return `${ws.towers[a.id].name} is not reachable from the library`;
      s.openPath(path);
      return ws.towers[a.id].name;
    }
    case 'layer': {
      const layer = tower?.layers[a.index];
      if (!layer) return NOT_UNDERSTOOD;
      if (s.library) s.showLibrary(false);
      s.select(undefined);
      s.focusLayer(a.index);
      return `L${String(a.index + 1).padStart(2, '0')} ${layer.title}`;
    }
    case 'node': {
      const t = ws.towers[a.tower];
      const layer = t?.layers.findIndex((l) => l.nodes.some((n) => n.key === a.key)) ?? -1;
      if (layer < 0) return NOT_UNDERSTOOD;
      if (s.library) s.showLibrary(false);
      if (a.tower !== tower?.id) {
        const path = towerPath(ws, a.tower);
        if (!path) return `${t.name} is not reachable from the library`;
        s.openPath(path, a.key);
      } else s.select(a.key);
      useStore.getState().focusLayer(layer);
      return `${findNode(t, a.key)?.label} · ${t.layers[layer].title}`;
    }
    case 'view': chooseView(a.view); return a.view === 'map' ? 'Map view' : 'Tower view';
    case 'overview':
      if (s.library) s.showLibrary(false);
      s.select(undefined);
      s.resetView();
      return 'Overview';
    case 'back':
      if (s.library && s.stack.length) s.showLibrary(false);
      else if (s.file) s.openFile(undefined);
      else if (s.selected) s.select(undefined);
      else if (s.focusedLayer !== undefined) s.resetView();
      else if (s.stack.length > 1) s.goTo(s.stack.length - 2);
      else s.showLibrary(true);
      return 'Back';
    case 'enter': {
      const node = findNode(tower, s.selected);
      if (!node?.tower) return 'No sub-tower here';
      if (s.library) s.showLibrary(false);
      s.enterTower(node.tower);
      return ws.towers[node.tower]?.name ?? 'Sub-tower';
    }
    case 'close': s.openFile(undefined); s.select(undefined); return 'Closed';
    // Closing the file keeps the selection: the node stays on screen behind the now empty viewer.
    case 'close-file':
      if (!s.file) return 'No file open';
      s.openFile(undefined);
      return 'File closed';
    case 'its-file': return runItsFile(a.index);
    case 'step': return runStep(a.dir, a.what);
    case 'scroll':
      // No file open: the viewer's own listener never mounts, so the action answers here.
      if (!s.file) return 'No file open';
      window.dispatchEvent(new CustomEvent(SCROLL_EVENT, { detail: a.to }));
      return a.to === 'down' ? 'Scrolled down' : a.to === 'up' ? 'Scrolled up' : a.to === 'top' ? 'Top of the file' : 'End of the file';
    case 'hub': {
      const hub = useHub.getState();
      if (a.tab === 'close') { hub.close(); return 'Hub closed'; }
      // Opening is a read of the hub's own view; on a non-hub page there is nothing to show.
      if (hub.me?.hub === false) return 'Not a hub';
      hub.show(a.tab);
      return a.tab === 'machines' ? 'Hub · Machines' : 'Hub';
    }
    case 'mic-off': setTimeout(stop); return 'Microphone off';
    case 'ambiguous': return `Which one? ${a.options.map((o, i) => `${i + 1}. ${o.label}`).join('  ')}`;
    case 'unknown': return NOT_UNDERSTOOD;
  }
}
