import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
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

  it('passes the given folder and the issue number the caller names', async () => {
    const { deps, calls } = setup();
    await deps.role('architect', 'Plan it', '/wt/7', 7);
    const args = calls[0].args;
    expect(args[args.indexOf('--repo') + 1]).toBe('/wt/7');
    expect(args[args.indexOf('--issue') + 1]).toBe('7');
  });

  it('does not read the issue from the prompt text', async () => {
    const { deps, calls } = setup();
    await deps.role('triage', 'Issue #7: fix');
    expect(calls[0].args).not.toContain('--issue');
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

  it('removes a leftover worktree at the same path before worktree add', async () => {
    const { deps, calls, home } = setup();
    // A failed earlier attempt left its folder behind; the rerun must clear it before adding.
    mkdirSync(join(home, 'squad-runner', 'worktrees', 'flow-tower-7'), { recursive: true });
    await deps.worktree({ number: 7, title: 'x' });
    const removeAt = calls.findIndex((c) => c.args.includes('remove'));
    const addAt = calls.findIndex((c) => c.args.includes('add'));
    expect(removeAt).toBeGreaterThanOrEqual(0);
    expect(calls[removeAt].args).toContain('--force');
    expect(addAt).toBeGreaterThan(removeAt);
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

  it('refuses the names . and .. and a hidden name', () => {
    const { deps, repo } = setup();
    expect(() => deps.writeTasks(repo, 7, [{ name: '..', text: 'x' }])).toThrow('bad task file name');
    expect(() => deps.writeTasks(repo, 7, [{ name: '.', text: 'x' }])).toThrow('bad task file name');
    expect(() => deps.writeTasks(repo, 7, [{ name: '.hidden', text: 'x' }])).toThrow('bad task file name');
  });
});

describe('steps', () => {
  it('runs the runner folder steps.sh, not the copy in the worktree the coder may edit', () => {
    const { deps, calls } = setup();
    deps.steps('/wt/7', '/tasks/7', { number: 7 });
    const c = calls[0];
    expect(c.cmd).toBe('bash');
    expect(c.args[0]).toBe(join('/runner', 'steps.sh'));
    expect(c.args).not.toContain(join('/wt/7', 'tools', 'squad', 'steps.sh'));
    expect(c.opts.env.REPO).toBe('/wt/7');
  });
});

describe('quality', () => {
  it('reruns security with the main checkout reviewer model, not the worktree copy', async () => {
    const home = tmp();
    const repo = tmp();
    const wt = tmp();
    // The main checkout's squad.json names the fallback model; the worktree copy is the coder's to edit and must not be read.
    mkdirSync(join(repo, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(repo, 'tools', 'squad', 'squad.json'), JSON.stringify({ models: { reviewer: 'rev/model' } }));
    mkdirSync(join(wt, 'tools', 'squad'), { recursive: true });
    writeFileSync(join(wt, 'tools', 'squad', 'squad.json'), JSON.stringify({ models: { reviewer: 'evil/model' } }));
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
    const q = deps.quality(wt, { number: 7 });
    expect(q.ok).toBe(true);
    expect(q.security).toEqual({ verdict: 'approve', findings: [] });
    expect(securityRuns).toHaveLength(2);
    expect(securityRuns[1][securityRuns[1].indexOf('--model') + 1]).toBe('rev/model');
    expect(readFileSync(join(home, 'squad-runner', 'out', '7-security.out'), 'utf8')).toBe(VERDICT('approve'));
  });
});

describe('push', () => {
  it('force-with-leases only a squad/ branch, so a rerun can replace its own pushed branch', () => {
    const { deps, calls, repo } = setup();
    deps.push(repo, 'squad/7-x');
    expect(calls[calls.length - 1].args).toEqual(['-C', repo, 'push', '--force-with-lease', '-u', 'origin', 'squad/7-x']);
  });

  it('refuses main and any non-squad branch before git runs', () => {
    const { deps, calls, repo } = setup();
    expect(() => deps.push(repo, 'main')).toThrow(/not a squad\/ branch/);
    expect(() => deps.push(repo, 'feature/x')).toThrow(/not a squad\/ branch/);
    expect(calls).toHaveLength(0);
  });

  it('runs git push without OPENROUTER_API_KEY, since project git hooks run inside push', () => {
    const before = env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-testkey000000';
    try {
      const { deps, calls, repo } = setup();
      deps.push(repo, 'squad/7-x');
      const push = calls[calls.length - 1];
      expect(push.opts.env).not.toHaveProperty('OPENROUTER_API_KEY');
      expect(push.opts.env.PATH).toBe(env.PATH);
    } finally {
      if (before === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = before;
    }
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

describe('quality pack failure', () => {
  it('returns the pack error and runs no role when pack.mjs exits nonzero', () => {
    const { deps, calls } = setup((c) => (c.args[0].endsWith('pack.mjs')
      ? { status: 2, stderr: 'pack broke\nmore detail' }
      : { status: 0, stdout: VERDICT('approve') }));
    const q = deps.quality('/repo', { number: 7 });
    expect(q).toEqual({ ok: false, error: 'pack failed for reviewer: pack broke' });
    expect(calls.some((c) => c.args[0].endsWith('run.mjs'))).toBe(false);
  });
});

describe('pack and gate env', () => {
  it('gives pack.mjs and gate.mjs no OPENROUTER_API_KEY, while the rest of the environment stays', () => {
    const before = env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-testkey000000';
    try {
      const { deps, calls } = setup((c) => ({
        status: 0,
        stdout: c.args[0].endsWith('gate.mjs') ? 'READY: #77\n' : VERDICT('approve'),
      }));
      deps.quality('/repo', { number: 7 });
      deps.gate('/repo', 'https://github.com/o/r/pull/77');
      const pack = calls.find((c) => c.args[0].endsWith('pack.mjs'));
      const gate = calls.find((c) => c.args[0].endsWith('gate.mjs'));
      expect(pack?.opts?.env).toBeDefined();
      expect(gate?.opts?.env).toBeDefined();
      expect(pack?.opts.env).not.toHaveProperty('OPENROUTER_API_KEY');
      expect(gate?.opts.env).not.toHaveProperty('OPENROUTER_API_KEY');
      expect(gate?.opts.env.PATH).toBe(env.PATH);
    } finally {
      if (before === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = before;
    }
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

  it('reads the ledger named by SQUAD_LEDGER when it is set', () => {
    const home = tmp();
    const other = join(tmp(), 'other-ledger.jsonl');
    writeFileSync(other, JSON.stringify({ issue: '7', role: 'coder', model: 'm', cost: 2 }) + '\n');
    const before = env.SQUAD_LEDGER;
    process.env.SQUAD_LEDGER = other;
    try {
      const deps = makeDeps({ repo: '/repo', home, exec: fakeExec().exec, runner: '/runner' });
      expect(deps.spent(7)).toBe(2);
    } finally {
      if (before === undefined) delete process.env.SQUAD_LEDGER;
      else process.env.SQUAD_LEDGER = before;
    }
  });
});
