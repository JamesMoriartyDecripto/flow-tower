/**
 * Project sources (#165): on the hub, which towers came from this machine and which from each device that
 * shared them. A satellite shares a tower into `<library>/towers/<machine>/<name>/` (#164), so the folder
 * under `towers/` says where it came from. Kept apart from plugin.ts so the wiring there stays small.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Who each project belongs to: `local`, or the machine folder it sits in under `<library>/towers/`. A folder
 * copied there by hand (a CI tower, see the #164 README) counts as a machine named after that folder. A
 * file at the library root, or in a `towers/` folder outside the library, is `local`. Undefined when there is
 * no library, or no project came from a machine: a plain library then shows nothing new.
 */
export function projectSources(
  projects: { id: string; file: string }[], library: string | undefined,
): Record<string, string> | undefined {
  if (library === undefined) return undefined;
  const towers = resolve(library, 'towers');
  const out: Record<string, string> = {};
  for (const { id, file } of projects) {
    // The path under `towers/`: `box-1/demo/x.tower.yaml`. `relative` keeps `towersx/...` out (it is not a
    // segment match), and a climb (`..`) or another drive (absolute) means the file is not under `towers/`.
    const parts = relative(towers, resolve(file)).split(sep);
    const under = parts.length >= 2 && parts[0] !== '..' && !isAbsolute(parts[0]);
    // `towers/x.tower.yaml` has no machine folder, only a file name: that one is this machine's.
    out[id] = under ? parts[0] : 'local';
  }
  return Object.values(out).some((s) => s !== 'local') ? out : undefined;
}
