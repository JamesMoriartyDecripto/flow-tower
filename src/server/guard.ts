import type { IncomingMessage } from 'node:http';

/**
 * Request guards shared by the endpoints that accept writes. The server binds to 127.0.0.1, but any
 * web page the user visits can still send requests to it: these checks make sure only this app, or
 * a local tool that is not a browser (curl, hooks, OTLP exporters), gets through.
 */

/**
 * Exact MIME essence. A substring test is not enough: `text/plain;x=application/json` contains it,
 * yet browsers send it cross-site without a CORS preflight because its essence is text/plain.
 */
export const isJson = (req: IncomingMessage) =>
  (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/json';

/**
 * A browser request from another site. Browsers say so with Sec-Fetch-Site or an Origin that is not
 * this server; tools that are not browsers send neither, so they still pass.
 */
export function crossSite(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}
