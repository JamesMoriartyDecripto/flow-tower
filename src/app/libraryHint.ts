/**
 * What the library footer says about adding projects. The advice must match the page: a library serve
 * (`flow-tower library`, every workspace project has an `origins` entry) adds towers to the user's
 * library; a hub is shared with teammates through `flow-tower share`; anywhere else `flow-tower <dir>`
 * scans the folder. Kept apart from Library.tsx so it can be tested without the store.
 */
export type LibraryHintKind = 'library' | 'hub' | 'plain';

export function libraryHint(kind: LibraryHintKind): string {
  if (kind === 'library') return 'add towers: flow-tower library add <path>';
  if (kind === 'hub') return 'teammates add towers with flow-tower share <folder>';
  return 'add projects: flow-tower <dir> scans every *.tower.yaml';
}
