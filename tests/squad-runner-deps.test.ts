import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without declarations
import { makeDeps } from '../tools/squad/runner-deps.mjs';

// The fake exec records every call and answers from a script keyed by the command's first argument after node/git/bash.
// Nothing here starts a real process: git, gh, node and OpenRouter are all replaced by this function.
type Call = { cmd: string; args: string[]; opts?: any };
function fakeExec(answers: (c: Call) => { status: number; stdout?: string; stderr?: string } = () => ({ status: 0 })) {
  const calls: Call[] = [];
  const exec = (cmd: string, args: string[], opts?: any) => {
    const c = { cmd, args, opts };
    calls.push(c);
    const r = answers(c);
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  return { exec, calls };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'squad-deps-'));
const VERDICT = (v: string) => JSON.stringify({ verdict: v, findings: [] });

function setup(answers?: Parameters<typeof fakeExec>[0]) {
  const home = tmp();
  const repo = join(tmp(), 'flow-tower');
  mkdirSync(repo, { recursive: true });
  const fake = fakeExec(answers);
  const deps = makeDeps({ repo, home, exec: fake.exec, runner: '/runner', now: () => 1000 });
  return { home, repo, ...fake, deps };
}

describe('role', () => {
  it('writes the prompt file and passes the triage node and the main checkout', async () => {
    const { deps, calls, home, repo } = setup(() => ({ status: 0, stdout: 'ok' }));
    const r = await deps.role('triage', 'Classify this');
    expect(r).toEqual({ ok: true, text: 'ok' });
    const c = calls[0];
    expect(c.cmd).toBe('node');
    expect(c.args).toContain('--node');
    expect(c.args[c.args.indexOf('--node') + 1]).toBe('intake.triage');
    expect(c.args[c.args.indexOf('--repo') + 1]).toBe(repo);
    expect(c.args).not.toContain('--issue');
    const file = c.args[c.args.indexOf('--task') + 1];
    expect(file.startsWith(join(home, 'squad-runner', 'tasks'))).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('Classify this');
  });

  it('passes the given folder and the issue number when the prompt starts with it', async () => {
    const { deps, calls } = setup();
    await deps.role('architect', 'Issue #7: fix', '/wt/7');
    const args = calls[0].args;
    expect(args[args.indexOf('--repo') + 1]).toBe('/wt/7');
    expect(args[args.indexOf('--issue') + 1]).toBe('7');
  });
});

describe('worktree', () => {
  it('makes the squad branch and runs fetch before worktree add', async () => {
    const { deps, calls } = setup();
    const wt = await deps.worktree({ number: 7, title: 'Fix the thing!' });
    expect(wt.branch).toBe('squad/7-fix-the-thing');
    expect(wt.path.endsWith('flow-tower-7')).toBe(true);
    const fetchAt = calls.findIndex((c) => c.args.includes('fetch'));
    const addAt = calls.findIndex((c) => c.args.includes('add'));
    expect(fetchAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(fetchAt);
    expect(calls[addAt].args).toContain('squad/7-fix-the-thing');
  });

  it('throws with the command and the first stderr line when git fails', async () => {
    const { deps } = setup(() => ({ status: 1, stderr: 'fatal: no remote\nmore' }));
    expect(() => deps.worktree({ number: 7, title: 'x' })).toThrow('git fetch: fatal: no remote');
  });
});

describe('writeTasks', () => {
  it('writes each file under the issue folder', () => {
    const { deps, repo } = setup();
    const dir = deps.writeTasks(repo, 7, [{ name: '01-a.md', text: 'A' }]);
    expect(dir).toBe(join(repo, 'tools', 'squad', 'tasks', '7'));
    expect(readFileSync(join(dir, '01-a.md'), 'utf8')).toBe('A');
  });

  it('refuses a name that escapes the folder', () => {
    const { deps, repo } = setup();
    expect(() => deps.writeTasks(repo, 7, [{ name: '../x.md', text: 'x' }])).toThrow('bad task file name');
  });
});

describe('quality', () => {
  it('reruns security with the reviewer model when the first answer has no verdict', async () => {
    const home = tmp();
    const repo = tmp();
    // squad.json names the reviewer model; the rerun must carry exactly that model.
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ models: { reviewer: 'rev/model' } }));
    const securityRuns: string[][] = [];
    const exec = (_cmd: string, args: string[]) => {
      if (args[0].endsWith('pack.mjs')) return { status: 0, stdout: 'packed', stderr: '' };
      if (args[0].endsWith('run.mjs') && args[args.indexOf('--role') + 1] === 'security') {
        securityRuns.push(args);
        const first = securityRuns.length === 1;
        return { status: 0, stdout: first ? 'no json here' : VERDICT('approve'), stderr: '' };
      }
      return { status: 0, stdout: VERDICT('approve'), stderr: '' };
    };
    const deps = makeDeps({ repo, home, exec, runner: '/runner' });
    const q = deps.quality(repo, { number: 7 });
    expect(q.ok).toBe(true);
    expect(q.security).toEqual({ verdict: 'approve', findings: [] });
    expect(securityRuns).toHaveLength(2);
    expect(securityRuns[1][securityRuns[1].indexOf('--model') + 1]).toBe('rev/model');
    expect(readFileSync(join(home, 'squad-runner', 'out', '7-security.out'), 'utf8')).toBe(VERDICT('approve'));
  });
});

describe('gate', () => {
  it('reads PR number 77 from the URL and reports READY from the output', async () => {
    // Every call answers with an approving verdict, and gate.mjs answers READY. quality runs first, since gate
    // reads the output files that quality saved for the issue.
    const { deps, calls, home } = setup((c) => ({
      status: 0,
      stdout: c.args[0].endsWith('gate.mjs') ? 'READY: #77 can be merged\n' : VERDICT('approve'),
    }));
    const q = deps.quality('/repo', { number: 7 });
    expect(q.ok).toBe(true);
    const r = deps.gate('/repo', 'https://github.com/o/r/pull/77');
    expect(r.ready).toBe(true);
    const args = calls[calls.length - 1].args;
    expect(args[args.indexOf('--pr') + 1]).toBe('77');
    expect(args[args.indexOf('--review') + 1]).toBe(join(home, 'squad-runner', 'out', '7-review.out'));
  });
});

describe('spent', () => {
  it('sums the cost of one issue from a ledger file', () => {
    const home = tmp();
    const ledger = join(home, 'squad-costs.jsonl');
    const rows = [
      { issue: '7', role: 'coder', model: 'm', cost: 1.5 },
      { issue: '7', role: 'reviewer', model: 'm', cost: 0.25 },
      { issue: '8', role: 'coder', model: 'm', cost: 9 },
    ];
    writeFileSync(ledger, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const deps = makeDeps({ repo: '/repo', home, exec: fakeExec().exec, runner: '/runner' });
    expect(deps.spent(7)).toBe(1.75);
    expect(existsSync(ledger)).toBe(true);
  });
});
