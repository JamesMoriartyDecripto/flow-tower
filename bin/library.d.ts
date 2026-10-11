/** Types for bin/library.js, so the bin and the tests can load the plain-JS helper. */

export const EMPTY_LIBRARY: string;

export function libraryEntries(options: {
  env: Record<string, string | undefined>;
  checkout: string;
  withExamples?: boolean;
  warn?: (message: string) => void;
}): { mine: string[]; entries: string[] };

export function warnInCheckout(options: {
  checkout: string;
  entries: string[];
  warn?: (message: string) => void;
}): void;
