export interface SheetReport {
  demo: string;
  totalDurationMs: number;
  scenes: { scene: string; startMs: number; endMs: number; durationMs: number }[];
}

export interface SheetNarration {
  scene: string;
  text: string;
}

export interface SheetInput {
  demo: string;
  report: SheetReport;
  scenes: SheetNarration[];
  /** Scene ids that have a thumbnail. */
  thumbs: Set<string>;
}

/** Returns a complete HTML document: a header, then one card per scene of the report, in order. */
export function buildSheet(input: SheetInput): string;

/** Formats milliseconds as m:ss with zero-padded seconds, e.g. 65000 -> `1:05`. */
export function mmss(ms: number): string;

export interface ParsedChapters {
  /** The last chapter's END; 0 when there are no chapters. */
  totalDurationMs: number;
  scenes: SheetReport['scenes'];
}

/** Parses an FFMETADATA chapters text (TIMEBASE 1/1000 assumed) into scenes, in file order. */
export function parseChapters(text: string): ParsedChapters;
