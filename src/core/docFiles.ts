import { nodeCode } from './docSummary.ts';
import type { ResolvedNode, Workspace } from './types.ts';

/*
 * The "Project files" appendix: every file the printed towers point at. This module only says what the
 * project references; the view reads the text through /api/file (or the static demo), so the rules for
 * what may be read stay in one place (src/server/files.ts).
 */

/** A file a printed tower references: the tower it is read from (for /api/file), its path, and the nodes using it. */
export interface AppendixFile {
  tower: string;
  path: string;
  /** `Tower name · N-L01.03` for each node that uses the file, in tower order, once each. */
  refs: string[];
  /** An optional file a run writes that does not exist yet: listed as "not generated yet", not an error. */
  notGenerated?: boolean;
}

/** The key the view and the completeness check use for one file: a tower and a path, joined without a newline. */
export const fileKey = (f: { tower: string; path: string }) => `${f.tower} :: ${f.path}`;

/** Every path one node references: its prompt, its files, its resources with a path, and the same of its agent. */
function pathsOf(n: ResolvedNode): string[] {
  const agent = n.agent;
  const paths = [
    n.prompt?.source ?? agent?.prompt?.source,
    ...n.files,
    ...n.resources.map((r) => r.path),
    ...(agent?.files ?? []),
    ...(agent?.resources ?? []).map((r) => r.path),
  ];
  return [...new Set(paths.filter((p): p is string => !!p))];
}

/**
 * Every file the towers in `depths` reference, once per (tower, path), sorted by path. A file used by two
 * towers is listed twice, since each tower reads it from its own root.
 */
export function appendixFiles(ws: Workspace, depths: Map<string, number>): AppendixFile[] {
  const byKey = new Map<string, AppendixFile>();
  for (const towerId of depths.keys()) {
    const tower = ws.towers[towerId];
    for (const l of tower.layers) {
      l.nodes.forEach((n, pos) => {
        const ref = `${tower.name} · ${nodeCode(l.index, pos + 1)}`;
        for (const path of pathsOf(n)) {
          const key = fileKey({ tower: towerId, path });
          const entry = byKey.get(key) ?? { tower: towerId, path, refs: [] };
          if (!entry.refs.includes(ref)) entry.refs.push(ref);
          if (n.missingOptional.includes(path)) entry.notGenerated = true;
          byKey.set(key, entry);
        }
      });
    }
  }
  // Sorted by path, then by tower, so the same project always prints the same appendix.
  return [...byKey.values()].sort((a, b) => cmp(a.path, b.path) || cmp(a.tower, b.tower));
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
