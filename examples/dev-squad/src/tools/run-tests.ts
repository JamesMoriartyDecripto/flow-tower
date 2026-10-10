import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const run = promisify(execFile);

interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: { name: string; assertionResults: { fullName: string; status: string; failureMessages: string[] }[] }[];
}

/**
 * Why a custom tool instead of plain Bash: the raw vitest output can be thousands
 * of lines. The agent gets a compact, structured summary with only the failures,
 * which keeps its context window for reasoning instead of log noise.
 */
export const runTests = (cwd: string) => tool(
  'run_tests',
  'Run the project test suite and return a compact summary. Use scope "affected" while iterating ' +
    '(tests related to files changed vs origin/main), "unit" before handing off, "e2e" only for UI changes.',
  {
    scope: z.enum(['affected', 'unit', 'integration', 'e2e']).default('affected'),
    pattern: z.string().max(200).optional().describe('Optional test name filter (-t)'),
  },
  async ({ scope, pattern }) => {
    const out = join(cwd, '.squad', 'vitest.json');
    const args = ['vitest', 'run', '--reporter=json', `--outputFile=${out}`];
    if (scope === 'affected') args.push('--changed', 'origin/main');
    if (scope === 'integration') args.push('--project', 'integration');
    if (scope === 'e2e') args.splice(0, args.length, 'playwright', 'test', '--reporter=json');
    if (pattern) args.push('-t', pattern);

    const started = Date.now();
    await run('npx', ['--no-install', ...args], { cwd, timeout: 10 * 60_000, maxBuffer: 32 * 1024 * 1024 }).catch(() => undefined);
    const report = JSON.parse(await readFile(out, 'utf8').catch(() => 'null')) as VitestReport | null;
    if (!report) return { content: [{ type: 'text', text: 'Test runner crashed before producing a report.' }], isError: true };

    const failures = report.testResults
      .flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => ({ file: f.name, ...a })))
      .slice(0, 10)
      .map((a) => `✗ ${a.fullName}\n  ${a.file}\n  ${a.failureMessages[0]?.split('\n').slice(0, 6).join('\n  ')}`);

    const summary = [
      `scope=${scope} passed=${report.numPassedTests}/${report.numTotalTests} failed=${report.numFailedTests} (${Math.round((Date.now() - started) / 1000)}s)`,
      ...failures,
      report.numFailedTests > 10 ? `…and ${report.numFailedTests - 10} more failures` : '',
    ].filter(Boolean);

    return { content: [{ type: 'text', text: summary.join('\n') }], isError: report.numFailedTests > 0 };
  },
  { annotations: { readOnlyHint: false, idempotentHint: true } },
);
