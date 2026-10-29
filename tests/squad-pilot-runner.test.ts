import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The pilot driver is plain .mjs: import it directly. Nothing here calls a model or reads a key.
const driver = await import(pathToFileURL(join(process.cwd(), 'examples/model-benchmark/scripts/squad-pilot.mjs')).href);

describe('squad pilot: case selection', () => {
  it('maps task ids to fixture repos by role', () => {
    expect(driver.caseFor('coder', 'bugfix-a')).toBe('case-a');
    expect(driver.caseFor('coder', 'bugfix-b')).toBe('case-b');
    expect(driver.caseFor('tester', 'tests-b')).toBe('case-b-clean');
    expect(driver.caseFor('verifier', 'check-b')).toBe('case-b-clean');
    expect(driver.caseFor('reviewer', 'events-204')).toBe('case-a');
  });

  it('keeps clean task ids out of the -b bug repo', () => {
    expect(driver.caseFor('coder', 'format-clean')).toBe('case-a');
  });
});

describe('squad pilot: prepareRepo', () => {
  it('copies a populated template and commits it as HEAD', () => {
    const templates = mkdtempSync(join(tmpdir(), 'pilot-tpl-'));
    const work = mkdtempSync(join(tmpdir(), 'pilot-work-'));
    try {
      mkdirSync(join(templates, 'case-a', 'src'), { recursive: true });
      writeFileSync(join(templates, 'case-a', 'src', 'main.ts'), 'export const x = 1;\n');
      const { repo, commit } = driver.prepareRepo('case-a', work, { templates });
      expect(commit).toMatch(/^[0-9a-f]{40}$/);
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
      expect(head).toBe(commit);
      const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: repo, encoding: 'utf8' });
      expect(files).toContain('src/main.ts');
    } finally {
      rmSync(templates, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('refuses a missing template instead of running an empty repo', () => {
    const work = mkdtempSync(join(tmpdir(), 'pilot-work-'));
    try {
      expect(() => driver.prepareRepo('case-b', work, { templates: join(work, 'nope') })).toThrow(/fixture template missing/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('squad pilot: hashing and copying', () => {
  it('ignores symlinks when hashing a folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-hash-'));
    try {
      writeFileSync(join(dir, 'a.txt'), 'a');
      const before = driver.hashTree(dir);
      symlinkSync('/etc/hosts', join(dir, 'link'));
      expect(driver.hashTree(dir)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('squad pilot: stop and resume rules', () => {
  it('stops at 85% of budget, not only above it', () => {
    expect(driver.overBudget(0.84, 1)).toBe(false);
    expect(driver.overBudget(0.85, 1)).toBe(true);
  });

  it('rejects unknown --roles and --models filters', () => {
    expect(driver.unknownFilters({ roles: ['codr'] })).toEqual(['role codr']);
    expect(driver.unknownFilters({ models: ['nope/model'] })).toEqual(['model nope/model']);
    expect(driver.unknownFilters({ roles: ['coder'], models: [] })).toEqual([]);
  });

  it('refuses an out folder inside the checkout or the task folder', () => {
    expect(driver.outProblem(join(process.cwd(), 'out'))).toMatch(/outside the checkout/);
    expect(driver.outProblem(join(tmpdir(), 'pilot-out'))).toBeNull();
  });
});

describe('squad pilot: verdict grading', () => {
  const approve = '{"verdict":"approve","findings":[]}';
  const changes = '{"verdict":"changes","findings":[{"file":"src/a.ts:3","quote":"const x = 1;","severity":"high"}]}';

  it('expects changes with a finding for a bug task and approve for a clean task', async () => {
    const parse = await driver.loadVerdictParser();
    expect(driver.verdictOk('check-b', changes, parse)).toBe(true);
    expect(driver.verdictOk('check-b', approve, parse)).toBe(false);
    expect(driver.verdictOk('check-clean', approve, parse)).toBe(true);
    expect(driver.verdictOk('check-clean', changes, parse)).toBe(false);
  });
});
