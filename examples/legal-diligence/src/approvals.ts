/**
 * Lawyer checkpoints. Each stage writes a draft to the review UI and blocks until a named
 * reviewer approves it. Edits made by the reviewer replace the AI draft and are kept in
 * the audit trail with both versions. A rejection sends the stage back with comments.
 */
export type Stage = 'scope' | 'classification' | 'review_table' | 'flags' | 'report';

const APPROVER: Record<Stage, string> = {
  scope: 'lead associate',
  classification: 'associate',
  review_table: 'associate',
  flags: 'senior associate',
  report: 'partner',
};

export async function awaitApproval(matterId: string, stage: Stage): Promise<void> {
  const res = await fetch(`https://dd.example-firm.eu/api/matters/${matterId}/checkpoints/${stage}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approver: APPROVER[stage] }),
  });
  if (!res.ok) throw new Error(`checkpoint ${stage}: ${res.status}`);
  // The review UI calls back (webhook) on approve / reject; the pipeline resumes from its checkpoint.
}
