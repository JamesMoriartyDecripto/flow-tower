/** `notes` on an approval: approved with changes, e.g. parts moved out of scope to follow-up issues. */
export type Decision = { kind: 'approved'; notes?: string } | { kind: 'revise'; notes: string };

/** A REST issue comment as returned by `gh api repos/{repo}/issues/{n}/comments`. */
export interface IssueComment {
  body: string;
  created_at: string;
  user?: { login?: string } | null;
}

const COMMAND = /^\/squad (approve|revise)\b\s*([\s\S]*)$/;
const WRITE_PERMISSIONS = ['write', 'maintain', 'admin'];

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
export async function selectDecision(
  comments: IssueComment[],
  since: Date,
  canPush: (login: string) => Promise<boolean>,
): Promise<Decision | undefined> {
  const candidates = comments
    .filter((c) => new Date(c.created_at) > since && COMMAND.test(c.body.trim()) && c.user?.login)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const verdicts = new Map<string, Promise<boolean>>();
  for (const c of candidates) {
    const login = c.user!.login!;
    if (!verdicts.has(login)) verdicts.set(login, canPush(login).catch(() => false));
    if (!(await verdicts.get(login))) continue;
    const [, verb, notes] = COMMAND.exec(c.body.trim())!;
    return verb === 'approve'
      ? { kind: 'approved', ...(notes.trim() && { notes: notes.trim() }) }
      : { kind: 'revise', notes: notes.trim() };
  }
  return undefined;
}
