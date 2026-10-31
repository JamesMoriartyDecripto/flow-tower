import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module with no declaration file (no .d.mts is written for it)
import { makeGh } from '../tools/squad/runner-gh.mjs';

type Call = { cmd: string; args: string[]; opts: { input?: string } };
type Result = { status: number; stdout: string; stderr: string };

// A fake exec: records every call and answers from a script, in order. Unscripted calls succeed with empty output.
function fakeExec(script: Result[] = []) {
  const calls: Call[] = [];
  const exec = (cmd: string, args: string[], opts: { input?: string } = {}) => {
    calls.push({ cmd, args, opts });
    return script.shift() ?? { status: 0, stdout: '', stderr: '' };
  };
  return { exec, calls };
}

const ok = (stdout = ''): Result => ({ status: 0, stdout, stderr: '' });
const REPO = 'owner/name';

describe('makeGh', () => {
  it('queue sorts issues by createdAt, oldest first', () => {
    const list = [
      { number: 3, createdAt: '2026-03-01T00:00:00Z' },
      { number: 1, createdAt: '2026-01-01T00:00:00Z' },
      { number: 2, createdAt: '2026-02-01T00:00:00Z' },
    ];
    const { exec, calls } = fakeExec([ok(JSON.stringify(list))]);
    const got = makeGh(exec, REPO).queue();
    expect(got.map((i: { number: number }) => i.number)).toEqual([1, 2, 3]);
    expect(calls[0].args).toContain('squad:go');
    expect(calls[0].args).toContain('--limit');
  });

  it('claim returns true when the re-read shows squad:running and not squad:go', () => {
    const { exec } = fakeExec([ok(), ok(JSON.stringify({ labels: [{ name: 'squad:running' }] }))]);
    expect(makeGh(exec, REPO).claim(7)).toBe(true);
  });

  it('claim returns false when the re-read still shows squad:go', () => {
    const { exec } = fakeExec([ok(), ok(JSON.stringify({ labels: [{ name: 'squad:go' }, { name: 'squad:running' }] }))]);
    expect(makeGh(exec, REPO).claim(7)).toBe(false);
  });

  it('claim also removes a stale squad:failed label', () => {
    const { exec, calls } = fakeExec([ok(), ok(JSON.stringify({ labels: [{ name: 'squad:running' }] }))]);
    makeGh(exec, REPO).claim(7);
    expect(calls[0].args).toEqual(['issue', 'edit', '7', '-R', REPO, '--add-label', 'squad:running',
      '--remove-label', 'squad:go', '--remove-label', 'squad:failed']);
  });

  it('release removes only squad:running, so the issue never reads as ready for review', () => {
    const { exec, calls } = fakeExec();
    makeGh(exec, REPO).release(4);
    expect(calls[0].args).toEqual(['issue', 'edit', '4', '-R', REPO, '--remove-label', 'squad:running']);
    expect(calls[0].args).not.toContain('squad:review');
  });

  it('comment passes the body via input, never in the arguments', () => {
    const body = 'plan: --title evil\nline two';
    const { exec, calls } = fakeExec();
    makeGh(exec, REPO).comment(5, body);
    expect(calls[0].opts.input).toBe(body);
    expect(calls[0].args).toEqual(['issue', 'comment', '5', '-R', REPO, '--body-file', '-']);
    expect(calls[0].args.join(' ')).not.toContain('evil');
  });

  it('fail makes two calls in order: the comment, then the label swap', () => {
    const { exec, calls } = fakeExec();
    makeGh(exec, REPO).fail(9, 'tests are red');
    expect(calls).toHaveLength(2);
    expect(calls[0].args.slice(0, 2)).toEqual(['issue', 'comment']);
    expect(calls[0].opts.input).toBe('Dev Squad stopped: tests are red');
    expect(calls[1].args).toEqual(['issue', 'edit', '9', '-R', REPO, '--add-label', 'squad:failed', '--remove-label', 'squad:running']);
  });

  it('a nonzero status throws with the subcommand and the first stderr line', () => {
    const { exec } = fakeExec([{ status: 1, stdout: '', stderr: 'HTTP 404: not found\nmore detail' }]);
    expect(() => makeGh(exec, REPO).done(3)).toThrow(/gh issue edit failed: HTTP 404: not found/);
    expect(() => makeGh(fakeExec([{ status: 1, stdout: '', stderr: 'x' }]).exec, REPO).draftPr({
      branch: 'b', base: 'main', title: 't', bodyFile: 'f',
    })).toThrow(/gh pr create failed/);
  });

  it('every call has an array of args that includes -R and the repo', () => {
    const { exec, calls } = fakeExec([
      ok(JSON.stringify([])),
      ok(), ok(JSON.stringify({ labels: [{ name: 'squad:running' }] })),
      ok(), ok(), ok(), ok('https://github.com/owner/name/pull/1\n'), ok(),
    ]);
    const gh = makeGh(exec, REPO);
    gh.queue();
    gh.claim(1);
    gh.comment(1, 'hi');
    gh.fail(1, 'why');
    expect(gh.draftPr({ branch: 'squad/1', base: 'main', title: 't', bodyFile: 'b.md' })).toBe('https://github.com/owner/name/pull/1');
    gh.done(1);
    expect(calls).toHaveLength(8);
    for (const c of calls) {
      expect(Array.isArray(c.args)).toBe(true);
      expect(c.cmd).toBe('gh');
      const i = c.args.indexOf('-R');
      expect(i).toBeGreaterThan(-1);
      expect(c.args[i + 1]).toBe(REPO);
    }
  });
});
