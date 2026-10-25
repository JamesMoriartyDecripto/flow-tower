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
