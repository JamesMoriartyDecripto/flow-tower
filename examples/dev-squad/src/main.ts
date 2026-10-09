#!/usr/bin/env -S npx tsx
/**
 * Dev Squad entry point.
 *
 *   npx tsx src/main.ts run --repo acme/shop --issue 412     # one issue, from a terminal
 *   npx tsx src/main.ts serve --port 8787                    # GitHub webhook receiver
 *
 * The webhook only reacts to issues labelled `squad:go`, so a human always opts in.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { argv, env, exit } from 'node:process';
import { promisify } from 'node:util';
import { deliver } from './pipeline';

export interface Issue { repo: string; number: number; title: string; body: string; labels: string[] }

const sh = promisify(execFile);
const TRIGGER_LABEL = 'squad:go';
const seen = new Set<string>(); // webhook redelivery dedupe (use Redis in production)
const queue: Promise<void>[] = [];
const MAX_PARALLEL_ISSUES = 2;

async function fetchIssue(repo: string, number: number): Promise<Issue> {
  const { stdout } = await sh('gh', ['issue', 'view', String(number), '-R', repo, '--json', 'title,body,labels']);
  const raw = JSON.parse(stdout) as { title: string; body: string; labels: { name: string }[] };
  return { repo, number, title: raw.title, body: raw.body ?? '', labels: raw.labels.map((l) => l.name) };
}

function verifySignature(body: string, signature: string | undefined): boolean {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function serve(port: number) {
  createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/github') return res.writeHead(404).end();
    let body = '';
    for await (const chunk of req) body += chunk;
    if (body.length > 1_000_000) return res.writeHead(413).end();
    if (!verifySignature(body, req.headers['x-hub-signature-256'] as string)) return res.writeHead(401).end();

    const delivery = String(req.headers['x-github-delivery']);
    const event = JSON.parse(body);
    res.writeHead(202).end(); // ack fast: GitHub times out after 10s, agents take minutes

    const labelled = event.action === 'labeled' && event.label?.name === TRIGGER_LABEL;
    if (req.headers['x-github-event'] !== 'issues' || !labelled || seen.has(delivery)) return;
    seen.add(delivery);

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
  await deliver(await fetchIssue(repo, number));
} else if (command === 'serve') {
  serve(Number(flag('port') ?? 8787));
} else {
  console.error('usage: main.ts <run|serve> [options]');
  exit(1);
}
