import { useEffect } from 'react';
import type { Workspace } from '../core/types';
import { useStore } from './store';

export interface FilePayload { path: string; ext: string; content: string }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export const fetchFile = (tower: string, path: string) =>
  getJson<FilePayload>(`/api/file?tower=${encodeURIComponent(tower)}&path=${encodeURIComponent(path)}`);

/** Loads the workspace and re-fetches it whenever the server reports a change on disk. */
export function useWorkspaceSync() {
  useEffect(() => {
    const load = () =>
      getJson<Workspace>('/api/workspace')
        .then((ws) => useStore.getState().setWorkspace(ws))
        .catch((e: Error) => useStore.getState().setError(e.message));
    load();
    import.meta.hot?.on('flow-tower:update', load);
    return () => import.meta.hot?.off('flow-tower:update', load);
  }, []);
}
