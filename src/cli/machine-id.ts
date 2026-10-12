/**
 * The machine id a satellite enrols under, from a raw name (usually os.hostname()). It must match the hub's
 * id rules ([a-z0-9-], at most 32 characters), so a hostname like "MacBook-Pro.local" becomes "macbook-pro".
 * An empty result means nothing usable was left; the caller then asks for --machine.
 */
export function machineId(raw: string): string {
  const short = raw.toLowerCase().split('.')[0];
  return short
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
