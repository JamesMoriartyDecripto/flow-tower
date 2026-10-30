#!/usr/bin/env -S npx tsx
/**
 * Dev Squad entry point.
 *
 *   npx tsx src/main.ts run --repo acme/shop --issue 412     # one issue, from a terminal
 *   npx tsx src/main.ts serve --port 8787                    # GitHub webhook receiver
 *
 * The webhook only reacts to issues labelled `squad:go`, so a human always opts in.
 */
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { argv, env, exit } from 'node:process';
import { promisify } from 'node:util';
import { BodyTooLarge, readCappedBody, verifySignature } from './http-body';
import { deliver } from './pipeline';

export interface Issue { repo: string; number: number; title: string; body: string; labels: string[] }

const sh = promisify(execFile);
const TRIGGER_LABEL = 'squad:go';
// In memory: one container, one process. Redeliveries after a restart run again (the worktree add then fails loudly).
const seen = new Set<string>();
// Jobs resolve to a DeliveryOutcome; the webhook only waits for them, so the element type stays open.
const queue: Promise<unknown>[] = [];
const MAX_PARALLEL_ISSUES = Number(env.SQUAD_MAX_PARALLEL_ISSUES ?? 2);

async function fetchIssue(repo: string, number: number): Promise<Issue> {
  const { stdout } = await sh('gh', ['issue', 'view', String(number), '-R', repo, '--json', 'title,body,labels']);
  const raw = JSON.parse(stdout) as { title: string; body: string; labels: { name: string }[] };
  return { repo, number, title: raw.title, body: raw.body ?? '', labels: raw.labels.map((l) => l.name) };
}

function serve(port: number) {
  createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/github') return res.writeHead(404).end();
    let raw: Buffer;
    try {
      raw = await readCappedBody(req);
    } catch (err) {
      // Oversize or a dropped connection: answer if the socket is still open, never reject unhandled.
      if (!res.headersSent && !res.writableEnded) res.writeHead(err instanceof BodyTooLarge ? 413 : 400).end();
      return;
    }
    const delivery = String(req.headers['x-github-delivery']);
    const log = (msg: string) => console.log(`[webhook] ${new Date().toISOString()} delivery=${delivery} ${msg}`);
    if (!verifySignature(raw, req.headers['x-hub-signature-256'] as string | undefined, env.GITHUB_WEBHOOK_SECRET)) {
      log('sig=invalid -> 401');
      return res.writeHead(401).end();
    }

    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      log('bad JSON -> 400');
      return res.writeHead(400).end();
    }
    res.writeHead(202).end(); // ack fast: GitHub times out after 10s, agents take minutes

    const labelled = event.action === 'labeled' && event.label?.name === TRIGGER_LABEL;
    if (req.headers['x-github-event'] !== 'issues' || !labelled) return log(`${req.headers['x-github-event']}.${event.action} ignored -> 202`);
    if (seen.has(delivery)) return log(`issue=#${event.issue.number} duplicate -> 202 (deduped)`);
    seen.add(delivery);
    log(`issues.labeled issue=#${event.issue.number} label=${TRIGGER_LABEL} -> 202 running=${queue.length} max_parallel=${MAX_PARALLEL_ISSUES}`);

    const issue: Issue = {
      repo: event.repository.full_name,
      number: event.issue.number,
      title: event.issue.title,
      body: event.issue.body ?? '',
      labels: event.issue.labels.map((l: { name: string }) => l.name),
    };
    while (queue.length >= MAX_PARALLEL_ISSUES) await Promise.race(queue);
    const job = deliver(issue)
      .catch((err) => console.error(`[squad] #${issue.number} failed:`, err))
      .finally(() => queue.splice(queue.indexOf(job), 1));
    queue.push(job);
  }).listen(port, () => console.log(`[squad] webhook listening on :${port}/github`));
}

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
}

const [command] = argv.slice(2);
if (command === 'run') {
  const repo = flag('repo');
  const number = Number(flag('issue'));
  if (!repo || !number) {
    console.error('usage: main.ts run --repo <owner/name> --issue <number>');
    exit(1);
  }
  const outcome = await deliver(await fetchIssue(repo, number));
  // Only a draft PR is success; a rejected, blocked or failed issue must not look like a clean shell run.
  // exitCode (not exit()) so buffered stdout/stderr still flushes.
  if (outcome !== 'pr_open') {
    console.error(`[squad] #${number} ended as ${outcome}, not pr_open`);
    process.exitCode = 1;
  }
} else if (command === 'serve') {
  serve(Number(flag('port') ?? 8787));
} else {
  console.error('usage: main.ts <run|serve> [options]');
  exit(1);
}
