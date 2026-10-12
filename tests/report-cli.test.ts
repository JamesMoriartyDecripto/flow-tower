import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanEnv } from './fixtures/clean-env';

/**
 * `flow-tower report` (#174). The HTML path only: no browser runs in unit tests, so --html is the output checked.
 * Every fixture lives in a temp folder; nothing is written into the checkout.
 */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');
const dir = mkdtempSync(join(tmpdir(), 'flow-tower-report-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A security input that passes every blocking check: two findings, one with a CVSS score, one with a severity. */
const SECURITY = `title: Test assessment
client: Example Corp
window: Q3 2025
scope:
  - the API
methodology:
  - manual review
findings:
  - id: F-1
    title: Hardcoded key
    cvss: 9.1
    asset: api/config.ts
    description: A key is committed to the repository.
    recommendation: Rotate the key and read it from the environment.
  - id: F-2
    title: Verbose errors
    severity: low
    asset: api/errors.ts
    description: Stack traces reach the client.
    recommendation: Return a generic message.
`;

/** Runs the CLI in the temp folder, with its stdout and stderr captured; a stuck child is killed by the timeout. */
function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [CLI, 'report', ...args], {
      timeout: 60_000,
      cwd: dir,
      env: cleanEnv({ FLOW_TOWER_HOME: dir, ...env }),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const input = join(dir, 'assessment.yaml');
writeFileSync(input, SECURITY);

/** A project status input: the type whose sources appendix the draft cites. */
const STATUS = `project: Flow Tower
period: Sprint 12
overall: amber
milestones:
  - name: Payment switch
    due: 2025-10-01
    done: false
    rag: red
risks:
  - id: R-1
    title: Payment switch load
    impact: high
    owner: Ana
    mitigation: Load test before cut-over.
`;
const status = join(dir, 'status.yaml');
writeFileSync(status, STATUS);

describe('flow-tower report (#174)', () => {
  it('--list prints every type and exits 0', { timeout: 15_000 }, async () => {
    const r = await run(['--list']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('security-assessment');
    expect(r.stdout).toContain('required sections: summary, scope, methodology, findings, remediation, appendix-sources');
    expect(r.stdout).toContain('tower-documentation  Tower documentation');
    expect(r.stdout).toContain('required sections: (checked by flow-tower export)');
  });

  it('a draft that cites a source is badged and linked to the appendix', { timeout: 15_000 }, async () => {
    const drafts = join(dir, 'drafts-ok.json');
    writeFileSync(drafts, JSON.stringify([{ section: 'summary', text: 'The payment switch is the main risk this period.', cites: ['S1'] }]));
    const html = join(dir, 'drafted.html');
    const r = await run(['project-status', status, '--drafts', drafts, '--html', html]);
    expect(r.status).toBe(0);
    const text = readFileSync(html, 'utf8');
    expect(text).toContain('drafted');
    expect(text).toContain('href="#src-S1"');
    expect(text).toContain('[S1]');
  });

  it('a draft citing an unknown source S9 exits 1', { timeout: 15_000 }, async () => {
    const drafts = join(dir, 'drafts-bad.json');
    writeFileSync(drafts, JSON.stringify([{ section: 'summary', text: 'The payment switch is the main risk this period.', cites: ['S9'] }]));
    const html = join(dir, 'bad-cite.html');
    const r = await run(['project-status', status, '--drafts', drafts, '--html', html]);
    expect(r.status).toBe(1);
    expect(existsSync(html)).toBe(false);
  });

  it('tower-documentation refuses --html and --drafts with exit 2', { timeout: 15_000 }, async () => {
    const r = await run(['tower-documentation', input, '--html', join(dir, 'td.html')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('rendered by flow-tower export');
  });

  it('writes the HTML with the findings and no browser', { timeout: 15_000 }, async () => {
    const html = join(dir, 'out.html');
    const r = await run(['security-assessment', input, '--html', html]);
    expect(r.status).toBe(0);
    expect(existsSync(html)).toBe(true);
    const text = readFileSync(html, 'utf8');
    expect(text).toContain('F-1');
    expect(text).toContain('Hardcoded key');
    expect(text).toContain('F-2');
  });

  it('refuses a draft with digits: exit 1 and no file written', { timeout: 15_000 }, async () => {
    const drafts = join(dir, 'drafts.json');
    writeFileSync(drafts, JSON.stringify([{ section: 'summary', text: 'There are 2 findings.', cites: ['S1'] }]));
    const html = join(dir, 'refused.html');
    const r = await run(['security-assessment', input, '--drafts', drafts, '--html', html]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('draft-numbers');
    expect(existsSync(html)).toBe(false);
  });

  it('exits 2 on a bad type', { timeout: 15_000 }, async () => {
    const r = await run(['no-such-type', input, '--html', join(dir, 'x.html')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: flow-tower report');
  });
});
