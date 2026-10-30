import { describe, expect, it, vi } from 'vitest';
import type { IssueComment } from '../examples/dev-squad/src/loop/approval-select.ts';
import { awaitApproval, type ApprovalDeps } from '../examples/dev-squad/src/loop/await-approval.ts';

// Label approval evidence: the squad:approved label counts only through its newest labeled/unlabeled
// event, by a pusher, after the request. The clock is fake: the first wait ends the poll loop.
const SINCE = new Date('2026-01-01T00:00:00Z');
const START = SINCE.getTime() + 1_000;
const issue = { repo: 'acme/shop', number: 7 };
const at = (iso: string) => iso;

interface Event { event: string; created_at: string; actor: { login: string } | null; label: { name: string } }
const labelEvent = (event: 'labeled' | 'unlabeled', when: string, login: string | null = 'maintainer'): Event => ({
  event,
  created_at: at(when),
  actor: login === null ? null : { login },
  label: { name: 'squad:approved' },
});
const comment = (login: string, body: string, when: string): IssueComment => ({ body, created_at: when, user: { login } });

interface Setup {
  labels?: string[];
  events?: unknown;
  eventsError?: boolean;
  pages?: IssueComment[][];
  permissions?: Record<string, string | 'error'>;
}

/** Runs one poll-loop decision. Permission lookups for unknown logins throw, like a 404 from gh. */
async function run(setup: Setup) {
  let t = START;
  const perms = setup.permissions ?? { maintainer: 'write' };
  const gh = vi.fn(async (args: string[]) => {
    if (args[0] === 'issue') return JSON.stringify({ labels: (setup.labels ?? ['squad:approved']).map((name) => ({ name })) });
    if (args[1]?.endsWith('/comments')) return JSON.stringify(setup.pages ?? []);
    if (args[1]?.endsWith('/events')) {
      if (setup.eventsError) throw new Error('HTTP 502');
      return typeof setup.events === 'string' ? setup.events : JSON.stringify([setup.events ?? []]);
    }
    const login = /collaborators\/([^/]+)\/permission/.exec(args[1])![1];
    if (!(login in perms) || perms[login] === 'error') throw new Error('HTTP 500');
    return JSON.stringify({ permission: perms[login] });
  });
  const wait = vi.fn(async () => { t = Number.MAX_SAFE_INTEGER; });
  const deps: ApprovalDeps = { gh, wait, now: () => t };
  const answer = await awaitApproval(issue, SINCE, deps);
  return { answer, gh, wait };
}

const FRESH = '2026-01-02T00:00:00Z';
const EARLIER = '2026-01-01T12:00:00Z';
const LATER = '2026-01-02T06:00:00Z';

describe('label approval evidence', () => {
  it('approves a fresh label added by a pusher', async () => {
    const { answer } = await run({ events: [labelEvent('labeled', FRESH)] });
    expect(answer).toEqual({ kind: 'approved' });
  });

  it('does not approve a label older than the request', async () => {
    const { answer } = await run({ events: [labelEvent('labeled', '2025-12-31T23:00:00Z')] });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve a label stamped exactly at the request time', async () => {
    const { answer } = await run({ events: [labelEvent('labeled', '2026-01-01T00:00:00Z')] });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve when the actor only has triage, read, or no access', async () => {
    for (const permission of ['triage', 'read', 'error']) {
      const { answer } = await run({ events: [labelEvent('labeled', FRESH)], permissions: { maintainer: permission } });
      expect(answer).toEqual({ kind: 'timeout' });
    }
    const { answer } = await run({ events: [labelEvent('labeled', FRESH, 'unknown-user')], permissions: {} });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve when the permission lookup errors', async () => {
    const { answer } = await run({ events: [labelEvent('labeled', FRESH)], permissions: { maintainer: 'error' } });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve an event with no actor or a malformed timestamp', async () => {
    expect((await run({ events: [labelEvent('labeled', FRESH, null)] })).answer).toEqual({ kind: 'timeout' });
    expect((await run({ events: [labelEvent('labeled', 'not-a-date')] })).answer).toEqual({ kind: 'timeout' });
  });

  it('does not fall back to an older authorized label after a newer unauthorized reapplication', async () => {
    const { answer } = await run({
      events: [labelEvent('labeled', EARLIER), labelEvent('unlabeled', LATER), labelEvent('labeled', LATER, 'outsider')],
      permissions: { maintainer: 'write', outsider: 'read' },
    });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve when the newest event is an unlabel', async () => {
    const { answer } = await run({ events: [labelEvent('labeled', EARLIER), labelEvent('unlabeled', FRESH)] });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve a label removed from the issue, even with a fresh labeled event', async () => {
    const { answer } = await run({ labels: [], events: [labelEvent('labeled', FRESH)] });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('does not approve when two relevant events share the newest instant', async () => {
    const { answer } = await run({ events: [labelEvent('labeled', FRESH), labelEvent('unlabeled', FRESH)] });
    expect(answer).toEqual({ kind: 'timeout' });
  });

  it('fails closed on a missing events read, a failed read, or malformed JSON', async () => {
    expect((await run({ eventsError: true })).answer).toEqual({ kind: 'timeout' });
    expect((await run({ events: '{not json' })).answer).toEqual({ kind: 'timeout' });
    expect((await run({ events: 'null' })).answer).toEqual({ kind: 'timeout' });
  });

  it('still honours a valid authorized comment when the events read fails', async () => {
    const pages = [[comment('maintainer', '/squad approve ship', FRESH)]];
    const { answer } = await run({ eventsError: true, pages });
    expect(answer).toEqual({ kind: 'approved', notes: 'ship' });
  });

  it('lets a newer authorized revise win over an older authorized label', async () => {
    const { answer } = await run({
      events: [labelEvent('labeled', EARLIER)],
      pages: [[comment('maintainer', '/squad revise cut scope', LATER)]],
    });
    expect(answer).toEqual({ kind: 'revise', notes: 'cut scope' });
  });

  it('lets a newer authorized label win over an older authorized revise', async () => {
    const { answer } = await run({
      events: [labelEvent('labeled', LATER)],
      pages: [[comment('maintainer', '/squad revise cut scope', EARLIER)]],
    });
    expect(answer).toEqual({ kind: 'approved' });
  });

  it('looks up permission once per actor and skips events when the label is absent', async () => {
    const { gh } = await run({
      events: [labelEvent('labeled', FRESH), labelEvent('labeled', LATER)],
      pages: [[comment('maintainer', '/squad approve', FRESH)]],
    });
    const permissionCalls = gh.mock.calls.filter(([a]) => a[1]?.includes('/permission'));
    expect(permissionCalls).toHaveLength(1);

    const absent = await run({ labels: [], events: [labelEvent('labeled', FRESH)] });
    expect(absent.gh.mock.calls.some(([a]) => a[1]?.endsWith('/events'))).toBe(false);
  });
});
