import type { FilePayload } from './api';

/**
 * Static demo (`npm run build:demo`, GitHub Pages): no server. The workspace and every referenced file
 * were frozen into data/ by scripts/build-demo.ts; live events come from the in-browser simulator.
 */
export const STATIC = import.meta.env.MODE === 'demo';

/**
 * `?embed=1` on the static build: a host page pushes real hub events (postMessage/ingest) instead of the
 * simulator. `?chrome=0` hides the HUD as well, for a host that draws its own. Pure, so it is testable.
 */
export function embedFlags(search: string, isStatic: boolean): { embed: boolean; chrome: boolean } {
  const q = new URLSearchParams(search);
  const embed = isStatic && q.get('embed') === '1';
  return { embed, chrome: !(embed && q.get('chrome') === '0') };
}

// Outside a browser (tests, node scripts) there is no location: not embedded, chrome shown.
const flags = typeof location === 'undefined' ? { embed: false, chrome: true } : embedFlags(location.search, STATIC);
export const EMBED = flags.embed;
export const CHROME = flags.chrome;

const data = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'not included in the demo' : res.statusText);
  return (await res.json()) as T;
}

export const staticWorkspace = <T,>() => json<T>(data('workspace.json'));

let index: Promise<Record<string, number>> | undefined;
export async function staticFile(tower: string, path: string): Promise<FilePayload> {
  index ??= json<Record<string, number>>(data('files/index.json'));
  const n = (await index)[`${tower}\n${path}`];
  if (n === undefined) throw new Error(`file not included in the demo: ${path}`);
  return json<FilePayload>(data(`files/${n}.json`));
}
