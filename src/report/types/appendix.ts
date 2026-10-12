/*
 * The sources appendix, shared by every report type. It lists each input file with its short hash, so a reader
 * can tell which file a number came from. Every type ends with it, so the sources check sees them as used.
 */

import { shortHash, type Section, type Source } from '../model.ts';

export function appendixSection(sources: readonly Source[]): Section {
  const blocks = sources.length
    ? [
        {
          kind: 'table' as const,
          columns: ['Id', 'Label', 'Location', 'SHA-256'],
          rows: sources.map((s) => [s.id, s.label, s.path ?? s.url ?? '', shortHash(s.sha256)]),
        },
      ]
    : [{ kind: 'text' as const, text: 'No source files were given.', origin: 'data' as const }];
  return { id: 'appendix-sources', title: 'Appendix: sources', blocks };
}
