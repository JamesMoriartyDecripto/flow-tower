import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** One line per test in the Release Auditor's e2e.log, so the tower's E2E report node opens the last run. */
const OUT = 'examples/release-auditor/reports/e2e.log';

export default class SummaryReporter implements Reporter {
  private lines: string[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const error = result.error?.message?.split('\n')[0] ?? '';
    this.lines.push(`${result.status.padEnd(8)} ${(result.duration / 1000).toFixed(1).padStart(6)}s  ${test.title}${error ? `  — ${error}` : ''}`);
  }

  onEnd(result: FullResult) {
    const failed = this.lines.filter((l) => !l.startsWith('passed') && !l.startsWith('skipped')).length;
    const head = `# npm run e2e: ${result.status}, ${this.lines.length} tests, ${failed} not passed (${new Date().toISOString().slice(0, 16)}Z)`;
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, [head, ...this.lines.sort()].join('\n') + '\n');
  }
}
