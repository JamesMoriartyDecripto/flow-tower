import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Shared setup for the steward end-to-end tests (#319-04): `prs.mjs --pr 7` runs for real against a git origin on disk,
// a stub gh on PATH and a stub OpenRouter on 127.0.0.1. Nothing reaches the network. Every spawn has an explicit 60 s
// timeout. Each test file starts its own fixture, so the files never share a folder, a server or a case counter.
export const PRS = resolve('tools/squad/prs.mjs');
export const SPAWN = { timeout: 60_000 };
export const VERDICT = '{"verdict":"approve","findings":[]}';
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

export interface Fixture {
  root: string;
  work: string;
  origin: string;
  bin: string;
  sha: string;
  base: string;
  server: Server;
  // Every chat request's model, in arrival order: the assertions count the passes by model.
  seenModels: string[];
  // Set by one case: the chat answers this model with an empty content, so the steward retries it.
  emptyModel: string | null;
  // Set by one case: the security model answers this text instead of the approve verdict.
  securityAnswer: string | null;
  caseCount: number;
}

export const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
export const commit = (cwd: string, msg: string) => git(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg);

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

// Builds the origin, the trusted checkout on `feature` (head sha, also fetched as refs/pull/7/head), the stub gh and
// the stub OpenRouter. Returns the state the cases read and change.
export async function startFixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'squad-e2e-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  const bin = join(root, 'bin');
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
  const sha = git(work, 'rev-parse', 'HEAD');
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

  const fx = { root, work, origin, bin, sha, base: '', server: null as unknown as Server, seenModels: [], emptyModel: null, securityAnswer: null, caseCount: 0 } as Fixture;
  fx.server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c; });
    req.on('end', () => {
      if (!req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
      const model = (JSON.parse(raw) as { model: string }).model;
      fx.seenModels.push(model);
      const content = model === fx.emptyModel ? ''
        : model === 'vendor-b/sec' && fx.securityAnswer !== null ? fx.securityAnswer : VERDICT;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { cost: 0.001, prompt_tokens: 10 } }));
    });
  });
  await new Promise<void>((r) => fx.server.listen(0, '127.0.0.1', () => r()));
  const { port } = fx.server.address() as { port: number };
  fx.base = `http://127.0.0.1:${port}/api/v1`;
  return fx;
}

export async function stopFixture(fx: Fixture): Promise<void> {
  await new Promise<void>((r) => fx.server.close(() => r()));
  rmSync(fx.root, { recursive: true, force: true });
}

// Each case gets its own temp folder for the outputs (TMPDIR) and the ledger, so caching never leaks between cases.
export function newCase(fx: Fixture): string {
  const dir = join(fx.root, `case-${fx.caseCount++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export type Result = { code: number; stdout: string; stderr: string };

// Async on purpose: the stub lives in this process, so a blocking spawn would deadlock the server.
export function runPrs(fx: Fixture, caseDir: string, stub: Record<string, string> = {}, args: string[] = ['--pr', '7']): Promise<Result> {
  const env = {
    ...process.env,
    PATH: `${fx.bin}:${process.env.PATH ?? ''}`,
    OPENROUTER_API_KEY: 'test-key',
    SQUAD_API_BASE: fx.base,
    SQUAD_LEDGER: join(caseDir, 'ledger.jsonl'),
    SQUAD_PACE: 'relaxed',
    TMPDIR: caseDir,
    ...stub,
  };
  return new Promise((resolvePromise) => {
    execFile('node', [PRS, ...args], { cwd: fx.work, env, encoding: 'utf8', timeout: SPAWN.timeout }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolvePromise({ code, stdout, stderr });
    });
  });
}

export const count = (fx: Fixture, model: string) => fx.seenModels.filter((m) => m === model).length;

// The output folder of a run for this head and base, as prs.mjs names it (#319-15): the merge base is read from the
// trusted checkout, the same way the steward reads it.
export const outDir = (fx: Fixture, caseDir: string, head: string, base = 'main') => {
  const mergeBase = git(fx.work, 'merge-base', `origin/${base}`, head);
  return join(caseDir, 'squad-prs', `pr-7-${head.slice(0, 12)}-${mergeBase.slice(0, 12)}`);
};
