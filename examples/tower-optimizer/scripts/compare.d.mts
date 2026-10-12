/** Types for scripts/compare.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

/** The subset of an audit tower that compare() reads; extra fields in the JSON are ignored. */
export interface AuditTower {
  id: string;
  name: string;
  inventory: unknown;
  findings: { rule: string; level: 'warning' | 'info'; node?: string; message: string }[];
  modelFit: { node: string; role: string; model?: string; categories: string[]; needs: string[]; prefer: string }[];
}

export interface Snapshot {
  towers: AuditTower[];
}

export interface CompareResult {
  towers: {
    id: string;
    name: string;
    status: 'present' | 'added' | 'removed';
    fixed: AuditTower['findings'];
    new: AuditTower['findings'];
    open: AuditTower['findings'];
    inventory: { name: string; before: number; after: number; delta: number }[];
    models: { node: string; role: { before?: string; after?: string }; model: { before: string | null | undefined; after: string | null | undefined } }[];
  }[];
  regression: boolean;
}

export function compare(before: Snapshot | { towers?: AuditTower[] }, after: Snapshot | { towers?: AuditTower[] }): CompareResult;
export function toMarkdown(result: CompareResult): string;
