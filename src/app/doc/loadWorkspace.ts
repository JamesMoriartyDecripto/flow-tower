import type { Workspace } from '../../core/types';
import { STATIC, staticWorkspace } from '../staticData';

/** The workspace as the app loads it: from the server, or from the frozen data in the static demo. */
export async function loadWorkspace(): Promise<Workspace> {
  if (STATIC) return staticWorkspace<Workspace>();
  const res = await fetch('/api/workspace');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as Workspace;
}
