/**
 * Hub mode (#287): which requests a remote viewer may load. The guard used to pass every GET of a listed
 * viewer to Vite, and Vite serves any file of the checkout (package.json, NEXT.md, hub.ts?raw). A viewer
 * only needs the app itself, so this decides from the raw URL: the app's pages, its modules and dependencies,
 * and the style sheets and fonts it uses. The raw URL is read, not `new URL()`, because that resolves `..`
 * before we can see it.
 */

/** The routes check their own access; the guard only lets them through. */
const API_PREFIX = '/api/';
/** The app reads its state from the query (?tower=, ?doc=, ?snap=), so any query is fine on these. */
const APP_PAGES = ['/', '/index.html'];
/** The Vite client, its env module and the React refresh runtime. */
const APP_EXACT = ['/@vite/client', '/@vite/env', '/@react-refresh'];
/** The app's own modules and Vite's client files. Vite's client files live under vite/dist/client. */
const APP_PREFIXES = ['/src/app/', '/src/core/', '/node_modules/vite/dist/client/'];
/**
 * Vite's pre-bundled dependencies. The CLI gives each port its own cache (node_modules/.vite/port-<port>/deps/),
 * a plain `vite` run uses node_modules/.vite/deps/. Other folders under .vite (vitest results, _metadata.json)
 * are not the app's and are not served.
 */
const VITE_DEPS_PATH = /^\/node_modules\/\.vite\/(port-\d+\/)?deps\//;
/**
 * Query flags Vite reads from anywhere in the raw URL (`/[?&]raw\b/` and the like). The pages take no Vite
 * flag, so a page whose URL carries one is refused.
 */
const VITE_FLAGS = /[?&](raw|url|inline|worker|sharedworker|worker_file|html-proxy|import|direct)\b/;
const NODE_MODULES_PREFIX = '/node_modules/';
/** Style sheets and fonts under node_modules (@fontsource, katex): nothing else there is a viewer's business. */
const NODE_MODULES_ASSET_EXTS = ['.css', '.woff', '.woff2', '.ttf', '.otf', '.eot'];
const FONT_EXTS = ['.woff', '.woff2', '.ttf', '.otf', '.eot'];
/** Query keys the app itself sends: a version stamp, a hot-reload timestamp and the document page's import. */
const ALLOWED_KEYS = new Set(['v', 't', 'import']);

const endsWithAny = (path: string, exts: string[]) => exts.some((ext) => path.endsWith(ext));

/**
 * The decoded path must be plain: Vite resolves dot segments, doubled slashes and stray separators itself,
 * so a path that needs them would be judged by the guard one way and read by Vite another way.
 * A segment ending in a dot or a space is refused too: Windows strips trailing dots and spaces from a
 * name, so `main.tsx.` would pass the guard and open `main.tsx`. This also covers `.` and `..`.
 */
function isPlainPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (/[\\\u0000?#]/.test(path) || path.includes('//')) return false;
  return !path.split('/').some((segment) => /[. ]$/.test(segment));
}

/** Whether the decoded path is one of the app's own assets, given the query keys already vetted. */
function isAppAsset(path: string, query: URLSearchParams): boolean {
  if (APP_EXACT.includes(path)) return true;
  if (APP_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (VITE_DEPS_PATH.test(path)) return true;
  // The document page imports the version from package.json; a plain read of it is not an app asset.
  if (path === '/package.json') return query.has('import');
  return path.startsWith(NODE_MODULES_PREFIX) && endsWithAny(path, NODE_MODULES_ASSET_EXTS);
}

/**
 * May a remote viewer load this request? `url` is the raw req.url (path and query, as received).
 * Refuses anything malformed, anything with a query flag that asks Vite for raw or worker output, and
 * any path outside the list above.
 */
export function isViewerRequest(url: string): boolean {
  const cut = url.indexOf('?');
  const rawPath = cut < 0 ? url : url.slice(0, cut);
  const rawQuery = cut < 0 ? '' : url.slice(cut + 1);

  let path: string;
  try { path = decodeURIComponent(rawPath); } catch { return false; } // a malformed escape is refused, not classified
  if (!isPlainPath(path)) return false;

  // Connect matches mounts case-insensitively, so /API/file reaches the route too.
  if (path.toLowerCase().startsWith(API_PREFIX)) return true;
  // Vite looks for its flags anywhere in the URL, so `?v=1?raw` would read as raw there; no real query has a second `?`.
  if (rawQuery.includes('?')) return false;
  if (APP_PAGES.includes(path)) return !VITE_FLAGS.test(url);

  const query = new URLSearchParams(rawQuery);
  for (const key of query.keys()) {
    if (ALLOWED_KEYS.has(key)) continue;
    // url= makes Vite return a font as a URL, direct= reads a style sheet; both are only meaningful there.
    if (key === 'url' && endsWithAny(path, FONT_EXTS)) continue;
    if (key === 'direct' && path.endsWith('.css')) continue;
    return false; // raw, inline, worker, worker_file... hand back the file's content or a worker, never allowed
  }
  return isAppAsset(path, query);
}
