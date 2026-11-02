import { relative, resolve, sep } from 'node:path';

/**
 * Ignore rule for the library watcher. Only folders (a new tower shows up), *.tower.yaml files and the files the
 * towers reference matter; everything else under an entry folder would take one inotify watch per file, and a
 * venv or a data folder can use up the system's limit. Inside an entry folder the segment rule matches
 * loader.ts walk(), which never reads node_modules or hidden folders either. Paths outside the entries are not
 * ours to ignore.
 */
export function watchIgnored(entries: string[], keep: (path: string) => boolean) {
  const folders = entries.map((e) => resolve(e));
  return (path: string, stats?: { isDirectory(): boolean }): boolean => {
    const folder = folders.find((f) => path === f || path.startsWith(f + sep));
    if (!folder) return false;
    if (relative(folder, path).split(sep).some((s) => s === 'node_modules' || s.startsWith('.'))) return true;
    // Chokidar calls the rule once without stats (for a path it may descend into): decide on segments only.
    if (!stats || stats.isDirectory()) return false;
    return !path.endsWith('.tower.yaml') && !keep(path);
  };
}
