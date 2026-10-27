import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * `flow-tower export --pdf` end to end: the real command starts its own server, prints the document with
 * the blocking checks, and writes the file. Skipped when no Chromium can launch (the same fallback the CLI uses).
 */

async function chromiumAvailable(): Promise<boolean> {
  for (const options of [{}, { channel: 'chrome' as const }]) {
    try {
      const browser = await chromium.launch(options);
      await browser.close();
      return true;
    } catch { /* try the next one */ }
  }
  return false;
}

test('export --pdf writes a checked PDF and exits 0', async () => {
  test.setTimeout(240_000);
  test.skip(!(await chromiumAvailable()), 'no Chromium to print with: npx playwright install chromium');
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-e2e-'));
  const out = join(dir, 'dev-squad.pdf');
  try {
    const r = spawnSync(process.execPath, ['bin/flow-tower.js', 'export', 'examples/dev-squad', '--pdf', '--level', '2', '--out', out], {
      encoding: 'utf8',
      timeout: 200_000,
    });
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/checks: \d+\/\d+ passed/);
    expect(statSync(out).size, 'a real document, not an empty file').toBeGreaterThan(10 * 1024);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('export --pdf --level 3 passes when a referenced file contains JSON (#277)', async () => {
  test.setTimeout(240_000);
  test.skip(!(await chromiumAvailable()), 'no Chromium to print with: npx playwright install chromium');
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-e2e-'));
  const out = join(dir, 'json-file.pdf');
  try {
    const r = spawnSync(process.execPath, ['bin/flow-tower.js', 'export', 'tests/fixtures/doc-json-file', '--pdf', '--level', '3', '--out', out], {
      encoding: 'utf8',
      timeout: 200_000,
    });
    expect(r.status, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/files 1\/1/);
    expect(statSync(out).size).toBeGreaterThan(10 * 1024);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
