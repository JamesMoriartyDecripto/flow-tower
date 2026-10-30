/** `notes` on an approval: approved with changes, e.g. parts moved out of scope to follow-up issues. */
export type Decision = { kind: 'approved'; notes?: string } | { kind: 'revise'; notes: string };

/** A decision with the time it was made (epoch ms), so comments and label events can be ordered. */
export interface TimedDecision {
  decision: Decision;
  at: number;
}

/** A REST issue comment as returned by `gh api repos/{repo}/issues/{n}/comments`. */
export interface IssueComment {
  body: string;
  created_at: string;
  user?: { login?: string } | null;
}

/** A REST issue event as returned by `gh api repos/{repo}/issues/{n}/events` (labeled/unlabeled). */
export interface LabelEvent {
  event?: string;
  created_at?: string;
  actor?: { login?: string } | null;
  label?: { name?: string } | null;
}

const COMMAND = /^\/squad (approve|revise)\b\s*([\s\S]*)$/;
const WRITE_PERMISSIONS = ['write', 'maintain', 'admin'];
export const APPROVED_LABEL = 'squad:approved';

/**
 * Whether a `collaborators/{login}/permission` response grants push. MEMBER or CONTRIBUTOR association
 * is not enough: an org member with read access must not be able to approve a plan.
 */
export function hasPushAccess(data: unknown): boolean {
  const d = data as { permission?: string; permissions?: { push?: boolean }; user?: { permissions?: { push?: boolean } } } | null;
  return d?.permissions?.push === true || d?.user?.permissions?.push === true || WRITE_PERMISSIONS.includes(d?.permission ?? '');
}

/**
 * The newest `/squad approve|revise` comment after `since` whose author can push to the repo.
 * Outsider commands are skipped, not fatal. `canPush` is called at most once per login; a rejected
 * lookup counts as no access (fail closed). Comments without a login are never authorized.
 */
export async function selectCommentDecision(
  comments: IssueComment[],
  since: Date,
  canPush: (login: string) => Promise<boolean>,
): Promise<TimedDecision | undefined> {
  const candidates = comments
    .filter((c) => new Date(c.created_at) > since && COMMAND.test(c.body.trim()) && c.user?.login)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const verdicts = new Map<string, Promise<boolean>>();
  for (const c of candidates) {
    const login = c.user!.login!;
    if (!verdicts.has(login)) verdicts.set(login, canPush(login).catch(() => false));
    if (!(await verdicts.get(login))) continue;
    const [, verb, notes] = COMMAND.exec(c.body.trim())!;
    const decision: Decision = verb === 'approve'
      ? { kind: 'approved', ...(notes.trim() && { notes: notes.trim() }) }
      : { kind: 'revise', notes: notes.trim() };
    return { decision, at: Date.parse(c.created_at) };
  }
  return undefined;
}

/** Comment-only view of `selectCommentDecision`, kept for callers that do not need timestamps. */
export async function selectDecision(
  comments: IssueComment[],
  since: Date,
  canPush: (login: string) => Promise<boolean>,
): Promise<Decision | undefined> {
  return (await selectCommentDecision(comments, since, canPush))?.decision;
}

/**
 * Label approval. Only the newest squad:approved labeled/unlabeled event counts, so an older
 * authorized label never survives a later unauthorized reapplication or an unlabel. It must be a
 * `labeled` event strictly after `since`, by an actor with push access. Missing or malformed
 * times, and two relevant events at the same instant, fail closed: the order is unknown.
 * The caller must already have checked that the label is currently on the issue.
 */
export async function selectLabelDecision(
  events: LabelEvent[],
  since: Date,
  canPush: (login: string) => Promise<boolean>,
): Promise<TimedDecision | undefined> {
  const relevant = events
    .filter((e) => (e.event === 'labeled' || e.event === 'unlabeled') && e.label?.name === APPROVED_LABEL)
    .map((e) => ({ e, t: Date.parse(e.created_at ?? '') }));
  if (relevant.length === 0 || relevant.some((r) => !Number.isFinite(r.t))) return undefined;
  relevant.sort((a, b) => b.t - a.t);
  const [newest, next] = relevant;
  if (newest.e.event !== 'labeled' || (next && next.t === newest.t)) return undefined;
  const login = newest.e.actor?.login;
  if (!login || newest.t <= since.getTime()) return undefined;
  if (!(await canPush(login))) return undefined;
  return { decision: { kind: 'approved' }, at: newest.t };
}
