import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The whole steward path (#319-04): `prs.mjs --pr 7` runs for real against a git origin on disk, a stub gh on PATH and
// a stub OpenRouter on 127.0.0.1. Nothing reaches the network. Every spawn has an explicit 60 s timeout.
const PRS = resolve('tools/squad/prs.mjs');
const SPAWN = { timeout: 60_000 };
const VERDICT = '{"verdict":"approve","findings":[]}';
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

let root = '';
let work = '';
let bin = '';
let sha = '';
let server: Server;
let base = '';
// Every chat request's model, in arrival order: the assertions count the passes by model.
let seenModels: string[] = [];
// Set by one case: the chat answers this model with an empty content, so the steward retries it.
let emptyModel: string | null = null;
// Set by one case: the security model answers this text instead of the approve verdict.
let securityAnswer: string | null = null;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
const commit = (cwd: string, msg: string) => git(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg);

// The stub gh answers only the calls the steward makes, by their exact argument list; anything else fails loudly.
// Two env switches let one case change it without rewriting the stub: STUB_GH_FAIL (JSON list of keys that exit 1)
// and STUB_GH_OVERRIDE (JSON object of answers replacing the defaults).
function stubGh(answers: Record<string, unknown>): string {
  return `#!/usr/bin/env node
const answers = ${JSON.stringify(answers)};
const key = process.argv.slice(2).join(' ');
const fail = JSON.parse(process.env.STUB_GH_FAIL || '[]');
if (fail.includes(key)) { process.stderr.write('stub gh: forced failure: ' + key + '\\n'); process.exit(1); }
const all = { ...answers, ...JSON.parse(process.env.STUB_GH_OVERRIDE || '{}') };
if (!(key in all)) { process.stderr.write('stub gh: unexpected call: ' + key + '\\n'); process.exit(1); }
console.log(JSON.stringify(all[key]));
`;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'squad-e2e-'));
  const origin = join(root, 'origin.git');
  work = join(root, 'work');
  bin = join(root, 'bin');
  git(root, 'init', '-q', '--bare', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  mkdirSync(join(work, 'src'), { recursive: true });
  mkdirSync(join(work, 'tools', 'squad'), { recursive: true });
  writeFileSync(join(work, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(work, 'tools', 'squad', 'squad.json'), `${JSON.stringify({
    review: ['src'],
    models: { reviewer: 'vendor-a/rev', security: 'vendor-b/sec' },
  }, null, 2)}\n`);
  git(work, 'add', '-A');
  commit(work, 'main');
  git(work, 'push', '-q', 'origin', 'main');

  git(work, 'checkout', '-q', '-b', 'feature');
  writeFileSync(join(work, 'src', 'a.ts'), 'export const a = 2;\n');
  git(work, 'add', '-A');
  commit(work, 'change a');
  sha = git(work, 'rev-parse', 'HEAD');
  git(work, 'push', '-q', 'origin', 'feature');
  // GitHub keeps every pull request head under refs/pull/<n>/head; the steward fetches it from there.
  git(work, 'push', '-q', 'origin', 'HEAD:refs/pull/7/head');

  mkdirSync(bin, { recursive: true });
  const gh = join(bin, 'gh');
  writeFileSync(gh, stubGh({
    'pr view 7 --json number,title,body,headRefOid,baseRefName': { number: 7, title: 'Change a', body: 'Closes #3', headRefOid: sha, baseRefName: 'main' },
    'issue view 3 --json title,body': { title: 'Issue three', body: 'The issue body.' },
    'pr checks 7 --json name,bucket': [{ name: 'check', bucket: 'pass' }],
    'pr view 7 --json mergeable,isDraft,headRefOid': { mergeable: 'MERGEABLE', isDraft: false, headRefOid: sha },
  }));
  chmodSync(gh, 0o755);

  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c; });
    req.on('end', () => {
      if (!req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
      const model = (JSON.parse(raw) as { model: string }).model;
      seenModels.push(model);
      const content = model === emptyModel ? ''
        : model === 'vendor-b/sec' && securityAnswer !== null ? securityAnswer : VERDICT;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { cost: 0.001, prompt_tokens: 10 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(root, { recursive: true, force: true });
});

// Each case gets its own temp folder for the outputs (TMPDIR) and the ledger, so caching never leaks between cases.
let caseCount = 0;
function newCase(): string {
  const dir = join(root, `case-${caseCount++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

type Result = { code: number; stdout: string; stderr: string };

// Async on purpose: the stub lives in this process, so a blocking spawn would deadlock the server.
function runPrs(caseDir: string, stub: Record<string, string> = {}, args: string[] = ['--pr', '7']): Promise<Result> {
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    OPENROUTER_API_KEY: 'test-key',
    SQUAD_API_BASE: base,
    SQUAD_LEDGER: join(caseDir, 'ledger.jsonl'),
    SQUAD_PACE: 'relaxed',
    TMPDIR: caseDir,
    ...stub,
  };
  return new Promise((resolvePromise) => {
    execFile('node', [PRS, ...args], { cwd: work, env, encoding: 'utf8', timeout: SPAWN.timeout }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolvePromise({ code, stdout, stderr });
    });
  });
}

const count = (model: string) => seenModels.filter((m) => m === model).length;

describe('prs.mjs --pr 7, end to end with no network', () => {
  it('runs fetch, worktree, pack, both passes, the gate, the table and the cleanup', async () => {
    seenModels = [];
    const caseDir = newCase();
    const r = await runPrs(caseDir);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(r.stdout).toMatch(/^\| #7 \| [0-9a-f]{7} \| approve \| approve \| READY \| \$0\.0020 \|$/m);
    expect([...seenModels].sort()).toEqual(['vendor-a/rev', 'vendor-b/sec']);
    expect(existsSync(join(caseDir, 'squad-prs', 'wt-pr-7'))).toBe(false);
    expect(git(work, 'worktree', 'list').split('\n')).toHaveLength(1);
  }, SPAWN.timeout);

  it('a second run on the same head uses the saved outputs: no chat request, still READY', async () => {
    const caseDir = newCase();
    seenModels = [];
    const first = await runPrs(caseDir);
    expect(first.code).toBe(0);
    const before = seenModels.length;
    expect(before).toBe(2);
    const second = await runPrs(caseDir);
    expect(second.code, second.stderr || second.stdout).toBe(0);
    expect(seenModels).toHaveLength(before);
    expect(second.stdout).toMatch(/^\| #7 \| [0-9a-f]{7} \| approve \| approve \| READY \| \$0\.0020 \|$/m);
    expect(readFileSync(join(caseDir, 'ledger.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
  }, SPAWN.timeout);

  it('an empty security answer is retried twice, then the reviewer model answers, and the row still says approve', async () => {
    const caseDir = newCase();
    seenModels = [];
    emptyModel = 'vendor-b/sec';
    try {
      const r = await runPrs(caseDir);
      expect(r.code, r.stderr || r.stdout).toBe(0);
      // Reviewer: one request. Security: the security model twice (both empty), then the reviewer model.
      expect(seenModels).toHaveLength(4);
      expect(count('vendor-b/sec')).toBe(2);
      expect(count('vendor-a/rev')).toBe(2);
      expect(r.stdout).toMatch(/^\| #7 \| [0-9a-f]{7} \| approve \| approve \| READY \| \$0\.0020 \|$/m);
    } finally {
      emptyModel = null;
    }
  }, SPAWN.timeout);

  // A throw after the worktree exists: the brief cannot be built (gh issue view fails) inside the try. The error is
  // reported on its own line, no model is called, and the finally removes the worktree.
  it('a throw after the worktree exists is reported as #7, leaves no worktree and calls no model', async () => {
    const caseDir = newCase();
    seenModels = [];
    const r = await runPrs(caseDir, { STUB_GH_FAIL: JSON.stringify(['issue view 3 --json title,body']) });
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(r.stdout).toMatch(/^#7: /m);
    expect(seenModels).toHaveLength(0);
    expect(existsSync(join(caseDir, 'squad-prs', 'wt-pr-7'))).toBe(false);
    expect(git(work, 'worktree', 'list').split('\n')).toHaveLength(1);
  }, SPAWN.timeout);

  // A security verdict with a high finding the gate cannot verify (quote too short) blocks the PR: the row says so,
  // the gate's NOT READY block names the security role, and no worktree is left behind.
  it('a security verdict that blocks the PR shows NOT READY with the gate block and leaves no worktree', async () => {
    const caseDir = newCase();
    seenModels = [];
    securityAnswer = '{"verdict":"changes","findings":[{"severity":"high","file":"src/a.ts:1","quote":"x","what":"w","why":"y","fix":"f"}]}';
    try {
      const r = await runPrs(caseDir);
      expect(r.code, r.stderr || r.stdout).toBe(0);
      expect(r.stdout).toMatch(/^\| #7 \| [0-9a-f]{7} \| approve \| changes: 1 high \| NOT READY \| \$0\.0020 \|$/m);
      expect(r.stdout).toMatch(/^NOT READY: #7$/m);
      expect(r.stdout).toMatch(/^- security: .*/m);
      expect(existsSync(join(caseDir, 'squad-prs', 'wt-pr-7'))).toBe(false);
    } finally {
      securityAnswer = null;
    }
  }, SPAWN.timeout);

  // A PR body without a closing keyword has no linked issue: the run is tagged with the PR number in the ledger.
  // A folder left by a failed pass (security.out says "empty answer") is not a cache hit: both passes run again.
  it('a failed saved answer is not cached: the next run calls the models again', async () => {
    const caseDir = newCase();
    const dir = join(caseDir, 'squad-prs', `pr-7-${sha.slice(0, 12)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'review.out'), `${VERDICT}\n`);
    writeFileSync(join(dir, 'security.out'), 'empty answer');
    seenModels = [];
    const r = await runPrs(caseDir);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect([...seenModels].sort()).toEqual(['vendor-a/rev', 'vendor-b/sec']);
  }, SPAWN.timeout);

  // A changed 50 KB file must not push the other files out of the task: only small files go in full, and the big one
  // stays in the diff. The head is moved to a commit that adds docs/big.md, then restored for the cases above.
  it('a 50 KB changed file stays out of the packed task and the small file is still packed in full', async () => {
    const caseDir = newCase();
    git(work, 'checkout', '-q', '--detach', sha);
    mkdirSync(join(work, 'docs'), { recursive: true });
    writeFileSync(join(work, 'docs', 'big.md'), 'line\n'.repeat(10_000));
    git(work, 'add', '-A');
    commit(work, 'add a big doc');
    const bigSha = git(work, 'rev-parse', 'HEAD');
    git(work, 'push', '-q', '-f', 'origin', `${bigSha}:refs/pull/7/head`);
    try {
      const view = { number: 7, title: 'Change a', body: 'Closes #3', headRefOid: bigSha, baseRefName: 'main' };
      const r = await runPrs(caseDir, { STUB_GH_OVERRIDE: JSON.stringify({ 'pr view 7 --json number,title,body,headRefOid,baseRefName': view }) });
      expect(r.code, r.stderr || r.stdout).toBe(0);
      const task = readFileSync(join(caseDir, 'squad-prs', `pr-7-${bigSha.slice(0, 12)}`, 'reviewer.task.md'), 'utf8');
      expect(task).toContain('### src/a.ts');
      expect(task).not.toContain('### docs/big.md');
      expect(task).not.toContain('full files left out');
    } finally {
      git(work, 'checkout', '-q', 'feature');
      git(work, 'reset', '-q', '--hard', sha);
      git(work, 'push', '-q', '-f', 'origin', `${sha}:refs/pull/7/head`);
    }
  }, SPAWN.timeout);

  it('a PR with no linked issue is tagged with its own number in the ledger', async () => {
    const caseDir = newCase();
    const r = await runPrs(caseDir, { STUB_GH_OVERRIDE: JSON.stringify({ 'pr view 7 --json number,title,body,headRefOid,baseRefName': { number: 7, title: 'Change a', body: 'No link here.', headRefOid: sha, baseRefName: 'main' } }) });
    expect(r.code, r.stderr || r.stdout).toBe(0);
    const lines = readFileSync(join(caseDir, 'ledger.jsonl'), 'utf8').trim().split('\n');
    expect(JSON.parse(lines.at(-1) as string)).toMatchObject({ issue: '7' });
  }, SPAWN.timeout);

  // The worktree and outputs are private to the ledger's folder, not beside the repo or in a shared temp folder.
  // --keep leaves the worktree in place so the case can see where it was created; the case removes it itself.
  it('the worktree of a run is created under <ledger folder>/squad-prs/', async () => {
    const caseDir = newCase();
    const r = await runPrs(caseDir, {}, ['--pr', '7', '--keep']);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    const wt = join(caseDir, 'squad-prs', 'wt-pr-7');
    expect(existsSync(wt)).toBe(true);
    expect(r.stdout).toContain(`outputs in ${join(caseDir, 'squad-prs')}`);
    git(work, 'worktree', 'remove', '--force', wt);
    expect(git(work, 'worktree', 'list').split('\n')).toHaveLength(1);
  }, SPAWN.timeout);

  // --repo must name a git work tree: a plain folder exits 2 with a message before any gh call is made.
  it('--repo pointing at a folder that is not a git work tree exits 2', async () => {
    const caseDir = newCase();
    const plain = join(caseDir, 'plain');
    mkdirSync(plain, { recursive: true });
    const r = await runPrs(caseDir, {}, ['--pr', '7', '--repo', plain]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/is not a git work tree/);
  }, SPAWN.timeout);

  // A comma in a changed path would split into two wrong paths in pack's --paths, so the file is left out with its
  // own line. The run still ends with a table row, and the other files stay in the task.
  it('a changed file with a comma in its name is left out of the task with a line, and the run still gives a row', async () => {
    const caseDir = newCase();
    git(work, 'checkout', '-q', '--detach', sha);
    mkdirSync(join(work, 'src'), { recursive: true });
    writeFileSync(join(work, 'src', 'a,b.ts'), 'export const b = 1;\n');
    git(work, 'add', '-A');
    commit(work, 'add a comma file');
    const commaSha = git(work, 'rev-parse', 'HEAD');
    git(work, 'push', '-q', '-f', 'origin', `${commaSha}:refs/pull/7/head`);
    try {
      const view = { number: 7, title: 'Change a', body: 'Closes #3', headRefOid: commaSha, baseRefName: 'main' };
      // The gate asks gh for the head again, so that answer must move too, or the gate sees a stale head.
      const gate = { mergeable: 'MERGEABLE', isDraft: false, headRefOid: commaSha };
      const r = await runPrs(caseDir, { STUB_GH_OVERRIDE: JSON.stringify({
        'pr view 7 --json number,title,body,headRefOid,baseRefName': view,
        'pr view 7 --json mergeable,isDraft,headRefOid': gate,
      }) });
      expect(r.code, r.stderr || r.stdout).toBe(0);
      expect(r.stdout).toContain('#7: src/a,b.ts left out of the review task (comma in the name)');
      expect(r.stdout).toMatch(/^\| #7 \| [0-9a-f]{7} \| approve \| approve \| READY \| \$0\.0020 \|$/m);
      const task = readFileSync(join(caseDir, 'squad-prs', `pr-7-${commaSha.slice(0, 12)}`, 'reviewer.task.md'), 'utf8');
      expect(task).toContain('### src/a.ts');
      expect(task).not.toContain('### src/a,b.ts');
    } finally {
      git(work, 'checkout', '-q', 'feature');
      git(work, 'reset', '-q', '--hard', sha);
      git(work, 'push', '-q', '-f', 'origin', `${sha}:refs/pull/7/head`);
    }
  }, SPAWN.timeout);
});
