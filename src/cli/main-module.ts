import { pathToFileURL } from 'node:url';

/**
 * True when this module is the process entry. `import.meta.url` is percent-encoded (a space is `%20`) while
 * `argv[1]` is a raw path, so the two are compared as file URLs, not as strings.
 */
export function isMainModule(metaUrl: string, entry = process.argv[1]): boolean {
  return entry !== undefined && pathToFileURL(entry).href === metaUrl;
}
