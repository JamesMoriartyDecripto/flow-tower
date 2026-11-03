import { ingest } from './demo';
import { useStore } from './store';

/**
 * What a host page gets on `window.flowTowerEmbed` (#444). The host pushes hub events every few seconds
 * through `apply`, and may switch the tower on screen with `open`.
 */
export function embedApi() {
  return {
    /** Returns how many events were applied; anything that is not an array applies nothing. */
    apply(events: unknown[]): number {
      return ingest(Array.isArray(events) ? events : []);
    },
    /** Opens a tower or project by id. An unknown id is ignored, so a stale host call cannot blank the view. */
    open(towerId: string): void {
      const ws = useStore.getState().workspace;
      if (!ws) return;
      if (ws.towers[towerId] || ws.projects.includes(towerId)) useStore.getState().openProject(towerId);
    },
  };
}

declare global {
  interface Window {
    flowTowerEmbed?: ReturnType<typeof embedApi>;
  }
}

export function installEmbed() {
  window.flowTowerEmbed = embedApi();
}
