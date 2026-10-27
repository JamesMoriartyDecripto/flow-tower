import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The steward's helpers are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { attemptModels, changedFiles, costOf, linkedIssue, outputDir, parseArgs, passOutcome, summaryRow, unverifiedCount, verdictSummary } from '../tools/squad/prs.mjs';

describe('parseArgs', () => {
  it('reads a list of PR numbers and flags', () => {
    expect(parseArgs(['--pr', '12,34', '--force'])).toMatchObject({ prs: [12, 34], force: true });
  });

  it('refuses a PR list with anything but digits', () => {
    expect(parseArgs(['--pr', '12;rm'])).toBeNull();
  });

  it('refuses an unknown flag', () => {
    expect(parseArgs(['--bogus'])).toBeNull();
  });

  it('gives prs null when --pr is absent', () => {
    expect(parseArgs([])).toMatchObject({ prs: null, force: false, keep: false, dryRun: false });
  });

  // Each PR costs two model passes, so --pr is capped at the 50 the gh list also takes.
  it('refuses more than 50 PR numbers in --pr', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(parseArgs(['--pr', fifty.join(',')])).toMatchObject({ prs: fifty });
    expect(parseArgs(['--pr', [...fifty, 51].join(',')])).toBeNull();
  });
});

describe('linkedIssue', () => {
  it('finds the first closing keyword link', () => {
    expect(linkedIssue('Closes #315; see #7')).toBe(315);
  });

  it('gives null when no keyword links an issue', () => {
    expect(linkedIssue('Fixes: nothing')).toBeNull();
  });
});

describe('passOutcome', () => {
  it('is ok for exit code 0', () => {
    expect(passOutcome(0, '')).toBe('ok');
  });

  it('is empty for an empty answer', () => {
    expect(passOutcome(1, 'empty answer')).toBe('empty');
  });

  it('is truncated for a cut answer', () => {
    expect(passOutcome(1, 'truncated answer (finish_reason: length)')).toBe('truncated');
  });

  it('is error for anything else', () => {
    expect(passOutcome(1, 'boom')).toBe('error');
  });

  it('is no-verdict for a one-request answer with no JSON verdict', () => {
    expect(passOutcome(1, 'no JSON verdict · m · $0.0010')).toBe('no-verdict');
  });

  it('is no-verdict for a loop answer with no JSON verdict after a second request', () => {
    expect(passOutcome(1, 'no JSON verdict after a second request · m')).toBe('no-verdict');
  });

  it('is ok when the text has no JSON verdict but the exit code is 0', () => {
    expect(passOutcome(0, 'no JSON verdict · m · $0.0010')).toBe('ok');
  });
});

describe('attemptModels', () => {
  it('tries the security model twice, then the reviewer model', () => {
    expect(attemptModels('security', { reviewer: 'r', security: 's' })).toEqual(['s', 's', 'r']);
  });

  it('tries the reviewer model twice', () => {
    expect(attemptModels('reviewer', { reviewer: 'r', security: 's' })).toEqual(['r', 'r']);
  });
});

describe('costOf', () => {
  it('sums every footer amount', () => {
    expect(costOf('--- m · 1 step · $0.0120 · x\n--- m · 1 step · $0.0030 · y')).toBeCloseTo(0.015);
  });

  it('is 0 when there is no amount', () => {
    expect(costOf('no footer')).toBe(0);
  });

  // A failed attempt's line ends with its amount, so it has no " ·" after it.
  it('counts an amount that ends a failed attempt line', () => {
    expect(costOf('truncated answer (finish_reason: length) · m · $0.0030')).toBeCloseTo(0.003);
  });

  it('counts a failed attempt and the footer after it', () => {
    expect(costOf('no JSON verdict · m · $0.0010\n--- m · 1 step · $0.0020 · cache 0%')).toBeCloseTo(0.003);
  });

  it('counts the cost of a loop answer with no JSON verdict after a second request', () => {
    expect(costOf('no JSON verdict after a second request · m · $0.0040')).toBeCloseTo(0.004);
  });
});

describe('changedFiles', () => {
  it('lists every touched path and only the paths that still exist', () => {
    const r = changedFiles('M\0a.ts\0D\0b.ts\0R100\0c.ts\0d.ts\0A\0e.ts\0');
    expect(r.paths).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']);
    expect(r.files).toEqual(['a.ts', 'd.ts', 'e.ts']);
  });

  it('keeps a path with a tab whole', () => {
    expect(changedFiles('M\0dir/a\tb.ts\0')).toEqual({ paths: ['dir/a\tb.ts'], files: ['dir/a\tb.ts'] });
  });

  it('keeps a non-ASCII path whole', () => {
    expect(changedFiles('A\0docs/città.md\0')).toEqual({ paths: ['docs/città.md'], files: ['docs/città.md'] });
  });

  it('keeps both sides of a copy in files', () => {
    expect(changedFiles('C75\0x.ts\0y.ts\0')).toEqual({ paths: ['x.ts', 'y.ts'], files: ['x.ts', 'y.ts'] });
  });
});

describe('outputDir', () => {
  it('names the folder by PR, the first 12 characters of the head and of the merge base', () => {
    expect(outputDir('/t', 7, 'abcdef0123456789', '0123456789abcdef')).toMatch(/pr-7-abcdef012345-0123456789ab$/);
  });

  // The diff starts at the merge base, so a base rewritten under the same name (a new merge base) gets another folder.
  it('gives another folder when only the merge base changes', () => {
    expect(outputDir('/t', 7, 'abcdef0123456789', '0123456789abcdef')).not.toBe(outputDir('/t', 7, 'abcdef0123456789', 'fedcba9876543210'));
  });
});

describe('summaryRow', () => {
  it('writes one Markdown row with a short head and a 4-decimal cost', () => {
    expect(summaryRow({ pr: 3, head: 'abcdef0123', review: 'approve', security: 'approve', unverified: 0, gate: 'READY', cost: 0.5 }))
      .toBe('| #3 | abcdef0 | approve | approve | 0 | READY | $0.5000 |');
  });
});

describe('unverifiedCount', () => {
  it('counts the "- " lines after the unverified header', () => {
    const text = 'NOT READY: #7\n- security: x\nUnverified findings (check them in the code before acting):\n- review src/a.ts:1: q\n- security src/b.ts:2: r\n';
    expect(unverifiedCount(text)).toBe(2);
  });

  it('is 0 when the gate says READY with no unverified header', () => {
    expect(unverifiedCount('READY: #7 can be merged\n')).toBe(0);
  });
});

describe('verdictSummary', () => {
  it('counts the findings by severity', () => {
    expect(verdictSummary('{"verdict":"changes","findings":[{"severity":"high"},{"severity":"low"},{"severity":"low"}]}'))
      .toBe('changes: 1 high, 2 low');
  });

  it('gives the verdict alone when there are no findings', () => {
    expect(verdictSummary('{"verdict":"approve","findings":[]}')).toBe('approve');
  });

  it('gives no verdict for a text without JSON', () => {
    expect(verdictSummary('empty answer')).toBe('no verdict');
  });
});

// The command line is spawned with a stub gh first on PATH, so no network or GitHub login is needed. The stub prints
// fixed JSON for the two calls the dry run makes: pr list (not used when --pr is given) and pr view.
// STUB_GH_FAIL (JSON list of "pr view <n>" keys) makes the stub exit 1 for those calls, so one case can break one PR.
const SPAWN = { timeout: 60_000 };
const STUB_GH = `#!/usr/bin/env node
const [cmd, sub, n] = process.argv.slice(2);
const fail = JSON.parse(process.env.STUB_GH_FAIL || '[]');
if (fail.includes([cmd, sub, n].join(' '))) { process.stderr.write('stub gh: forced failure\\n'); process.exit(1); }
const pr = (number, body) => ({ number, title: 'T' + number, body, headRefOid: 'a'.repeat(40), baseRefName: 'main' });
if (cmd === 'pr' && sub === 'list') console.log(JSON.stringify([{ number: 7 }, { number: 8 }]));
else if (cmd === 'pr' && sub === 'view') console.log(JSON.stringify(pr(Number(n), Number(n) === 7 ? 'Closes #9' : 'no link')));
else process.exit(1);
`;

function runPrs(args: string[], stubEnv: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'squad-prs-bin-'));
  writeFileSync(join(dir, 'gh'), STUB_GH);
  chmodSync(join(dir, 'gh'), 0o755);
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, ...stubEnv };
  return new Promise((resolve) => {
    execFile('node', ['tools/squad/prs.mjs', ...args], { env, encoding: 'utf8', timeout: 60_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

describe('prs.mjs command line', () => {
  it('--dry-run prints one line per PR with its tag and new, and exits 0', async () => {
    const r = await runPrs(['--dry-run']);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^#7 a{7} base origin\/main tag #9 -> .* \(cache unknown in a dry run\)$/);
    expect(lines[1]).toMatch(/^#8 a{7} base origin\/main tag #8 -> .* \(cache unknown in a dry run\)$/);
  }, SPAWN.timeout);

  it('a bad --pr list exits 2 with the usage on stderr', async () => {
    const r = await runPrs(['--pr', '1;x']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('usage: node tools/squad/prs.mjs');
  }, SPAWN.timeout);

  // One PR that gh cannot read gets its own error line; the run exits 0 and the other PR still gets its line.
  it('--dry-run with gh failing for pr 8 prints #7 and a #8 error line, and exits 0', async () => {
    const r = await runPrs(['--dry-run', '--pr', '7,8'], { STUB_GH_FAIL: JSON.stringify(['pr view 8']) });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^#7 a{7} base origin\/main tag #9 -> .* \(cache unknown in a dry run\)$/m);
    expect(r.stdout).toMatch(/^#8: /m);
    expect(r.stdout).not.toMatch(/^#8 a{7}/m);
  }, SPAWN.timeout);

  // The same number twice in --pr is reviewed once: one line, not two.
  it('--dry-run --pr 7,7 prints one line', async () => {
    const r = await runPrs(['--dry-run', '--pr', '7,7']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
  }, SPAWN.timeout);
});
