export interface Finding {
  node: string;
  quote: string;
  [key: string]: unknown;
}

export interface DroppedFinding {
  finding: Partial<Finding>;
  reason: string;
}

/** The raw text of one node ("layer.node"), or null when the key names no node. */
export function nodeText(yamlText: string, key: string): string | null;

/** Keeps the findings whose quote occurs in the named node (or anywhere, for `tower`). */
export function checkQuotes(
  yamlText: string,
  findings: Partial<Finding>[],
): { kept: Partial<Finding>[]; dropped: DroppedFinding[] };
