import { classifyBatch } from './classify';
import { extractDocument, type ClauseFamily } from './extract';
import { verifyCitations } from './citations';
import { awaitApproval } from './approvals';
import { auditLog } from './hooks/audit';

const FAMILIES: ClauseFamily[] = ['change_of_control', 'assignment', 'exclusivity', 'termination', 'indemnity'];

/** Bounded parallelism: Bedrock EU quota is shared by every matter in the region. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/**
 * One diligence run. Every stage ends in a lawyer checkpoint: nothing moves on until the
 * reviewer approves (possibly after editing). The AI output is a draft at every step.
 */
export async function runMatter(matterId: string, docIds: string[]) {
  await awaitApproval(matterId, 'scope'); // lead associate sets categories and thresholds

  const batches = Array.from({ length: Math.ceil(docIds.length / 250) }, (_, i) => docIds.slice(i * 250, (i + 1) * 250));
  const classified = (await pool(batches, 8, classifyBatch)).flat();
  // Privileged documents never reach extraction or the report.
  const inScope = classified.filter((d) => !d.privilege_flag && d.doc_type !== 'other.unclassified');
  await awaitApproval(matterId, 'classification');

  const jobs = inScope.flatMap((doc) => FAMILIES.map((family) => ({ doc, family })));
  const rows = await pool(jobs, 32, ({ doc, family }) => extractDocument(matterId, doc, family));
  const { verified, rejected } = await verifyCitations(rows.flat());
  auditLog({ matterId, stage: 'extraction', verified: verified.length, rejected: rejected.length });
  await awaitApproval(matterId, 'review_table'); // cell-level edits and flags in the review UI

  await awaitApproval(matterId, 'flags'); // senior associate, after scoring
  await awaitApproval(matterId, 'report'); // partner sign-off
}
