import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { createAcceptanceFixture, FAKE_KEY, toolCall, type AcceptanceFixture } from './helpers/squad-acceptance-fixture';

// One acceptance path: clean install -> doctor -> installed coder and tester, all against a loopback fake provider.
// Live delivery and cancellation are out of scope for this file.

const SUM_SRC = 'export const sum = (a, b) => a + b;\n';
// Deliberately wrong: the failing-check case swaps in this implementation so node:test reports a real failure.
const SUM_WRONG = 'export const sum = (a, b) => a - b;\n';
// The marker is written with fs at test time, so the file's presence proves the configured check actually ran.
const SUM_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { sum } from '../src/sum.mjs';

test('sum adds two numbers', () => {
  assert.equal(sum(2, 3), 5);
  writeFileSync(new URL('../.acceptance-marker', import.meta.url), 'ran');
});
`;

const TASK = [
  '# Add a sum helper',
  '',
  'Create src/sum.mjs exporting sum(a, b), and tests/sum.test.mjs covering it.',
  'You may write only src/ and tests/. Then finish.',
].join('\n');

const ledgerRows = (file: string): { role?: string; outcome?: string }[] =>
  existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];

/** Every regular file under a directory, skipping .git objects (binary, and the key is never written there). */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '.git' ? [] : filesUnder(p);
    return e.isFile() ? [p] : [];
  });
}

let fx: AcceptanceFixture;
let task: string;

beforeAll(async () => {
  fx = await createAcceptanceFixture();
  // The task lives beside the repo, not inside it, so it never becomes a file the coder must account for.
  task = join(dirname(fx.dir), 'task.md');
  writeFileSync(task, TASK);
}, 120_000);

afterAll(async () => {
  await fx?.close();
});

describe('squad acceptance: install, doctor, installed coder and tester', () => {
  it('init installed the squad with no project node_modules and no .cli source link', () => {
    expect(existsSync(join(fx.dir, 'tools', 'squad', 'run.mjs'))).toBe(true);
    expect(existsSync(join(fx.dir, 'tools', 'squad', '.cli'))).toBe(false);
    expect(existsSync(join(fx.dir, 'node_modules'))).toBe(false);
    // init ran after src/ and tests/ existed, so the generated write allowlist must include both.
    const config = JSON.parse(readFileSync(join(fx.dir, 'tools', 'squad', 'squad.json'), 'utf8'));
    expect(config.write).toEqual(expect.arrayContaining(['src', 'tests']));
  });

  it('the installed tower validates with 0 errors and 0 warnings', async () => {
    const squad = join(fx.dir, 'tools', 'squad');
    const lib = await loadLibrary([squad]);
    const issues = Object.values(lib.workspace.towers).flatMap((t) => t.issues);
    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'warning');
    expect(errors.map((i) => i.message)).toEqual([]);
    expect(warnings.map((i) => i.message)).toEqual([]);
    expect(Object.keys(lib.workspace.towers).length).toBeGreaterThan(0);
  });

  it('doctor without an OpenRouter key exits nonzero for OpenRouter readiness and sends no provider request', async () => {
    const r = await fx.cli(['squad', 'doctor', fx.dir], { key: undefined });
    expect(r.code, r.stderr || r.stdout).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/openrouter/i);
    expect(fx.requests).toHaveLength(0);
  });

  it('doctor with a fake key is ready and never echoes the key', async () => {
    const r = await fx.cli(['squad', 'doctor', fx.dir], { key: FAKE_KEY });
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/ready/i);
    expect(r.stdout + r.stderr).not.toContain(FAKE_KEY);
    expect(fx.requests).toHaveLength(0);
  });

  it('the installed coder writes src/sum.mjs and tests/sum.test.mjs through tool calls, then finishes', async () => {
    fx.setReplies([
      toolCall('w1', 'write_file', { path: 'src/sum.mjs', content: SUM_SRC }),
      toolCall('w2', 'write_file', { path: 'tests/sum.test.mjs', content: SUM_TEST }),
      toolCall('f1', 'finish', { report: 'Done.\nKnown gaps: none' }),
    ]);
    const r = await fx.runner(['--role', 'coder', '--model', 'fake/model', '--issue', '333', '--steps', '4', '--task', task]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(readFileSync(join(fx.dir, 'src', 'sum.mjs'), 'utf8')).toBe(SUM_SRC);
    expect(readFileSync(join(fx.dir, 'tests', 'sum.test.mjs'), 'utf8')).toBe(SUM_TEST);
    expect(ledgerRows(fx.env().SQUAD_LEDGER).filter((row) => row.outcome === 'finish')).toHaveLength(1);
  });

  it('the installed tester runs the configured check, the marker proves it, then finishes', async () => {
    fx.setReplies([toolCall('r1', 'run', { command: 'check' }), toolCall('f2', 'finish', { report: 'Done.\nKnown gaps: none' })]);
    const r = await fx.runner(['--role', 'tester', '--model', 'fake/model', '--issue', '333', '--steps', '4', '--task', task]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(readFileSync(join(fx.dir, '.acceptance-marker'), 'utf8')).toBe('ran');
    const finishes = ledgerRows(fx.env().SQUAD_LEDGER).filter((row) => row.outcome === 'finish');
    expect(finishes.map((row) => row.role)).toEqual(['coder', 'tester']);
  });

  it('a real failed project check: the tester reports it, the marker stays absent, and the project command exits nonzero', async () => {
    const marker = join(fx.dir, '.acceptance-marker');
    try {
      writeFileSync(join(fx.dir, 'src', 'sum.mjs'), SUM_WRONG);
      rmSync(marker, { force: true });
      const before = fx.requests.length;
      fx.setReplies([
        toolCall('r2', 'run', { command: 'check' }),
        toolCall('f3', 'finish', { report: 'Check failed: sum(2, 3) returns the wrong value.\nKnown gaps: failing suite' }),
      ]);
      const r = await fx.runner(['--role', 'tester', '--model', 'fake/model', '--issue', '333', '--steps', '4', '--task', task]);
      // The role completed its report: exit 0 means finish was reached, not that the project passed.
      expect(r.code, r.stderr || r.stdout).toBe(0);
      // The tool response the provider received must carry the real nonzero exit of the check.
      const sent = fx.requests.slice(before).map((b) => JSON.stringify(b));
      expect(sent.some((body) => body.includes('EXIT 1'))).toBe(true);
      expect(existsSync(marker)).toBe(false);
      const lastFinish = ledgerRows(fx.env().SQUAD_LEDGER).filter((row) => row.outcome === 'finish').at(-1);
      expect(lastFinish).toMatchObject({ role: 'tester' });
      // Independent evidence: the same project command, run without any key, really fails.
      const project = spawnSync(process.execPath, ['--test', 'tests/sum.test.mjs'], { cwd: fx.dir, env: fx.env(), encoding: 'utf8', timeout: 60_000 });
      expect(project.status, project.stderr || project.stdout).not.toBe(0);
      expect(project.status).toBe(1);
    } finally {
      // Later cases and the final assertions expect the good implementation back.
      writeFileSync(join(fx.dir, 'src', 'sum.mjs'), SUM_SRC);
    }
  }, 120_000);

  it('the project declares no dependencies and persists no fake provider key in project files or ledger', () => {
    const pkg = JSON.parse(readFileSync(join(fx.dir, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(existsSync(join(fx.dir, 'node_modules'))).toBe(false);
    const ledger = fx.env().SQUAD_LEDGER;
    const leaked = [...filesUnder(fx.dir), ...(existsSync(ledger) ? [ledger] : [])].filter((f) => readFileSync(f, 'utf8').includes(FAKE_KEY));
    expect(leaked).toEqual([]);
  });
});
