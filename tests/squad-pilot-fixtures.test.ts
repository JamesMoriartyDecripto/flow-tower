// Held-out Dev Squad pilot fixtures (#105): every task parses, the runner only ever sees the Prompt section,
// the answer keys stay out of it, and the synthetic case projects behave as their tasks say.
// Only fixture files are read; no network, no key.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { blocks, loadTask, loadTasks, taskProblems } from '../examples/model-benchmark/scripts/tasks.mjs';

const PILOT = resolve('examples/model-benchmark/tasks/squad-pilot');
const ROLES = ['triage', 'architect', 'researcher', 'coder', 'tester', 'reviewer', 'security', 'verifier', 'doc-writer'];
// case-b is the defective original the coder must fix; case-b-clean is the correct reference the controls use.
const CASES = ['case-a', 'case-b', 'case-b-clean'];
const TEMPLATES = join(PILOT, 'templates');
const SOLUTIONS = join(PILOT, 'answer-keys');
const scratch: string[] = [];

afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

// Copies a case template into a fresh temp folder, optionally replacing src/ with a solution file.
function materialize(caseName: string, solution?: string): string {
  const dir = mkdtempSync(join(tmpdir(), `squad-pilot-${caseName}-`));
  scratch.push(dir);
  cpSync(join(TEMPLATES, caseName), dir, { recursive: true });
  if (solution) cpSync(join(SOLUTIONS, solution), join(dir, 'src', caseName.startsWith('case-a') ? 'price.mjs' : 'guard.mjs'));
  return dir;
}

// Runs `node --test` in the copy; the pass/fail is the exit code, the output is kept for messages.
function runTests(dir: string) {
  return spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', timeout: 30_000 });
}

const tasks = loadTasks(PILOT) as Array<ReturnType<typeof loadTask>>;
const byId = (id: string) => {
  const t = tasks.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

describe('squad pilot task files', () => {
  it('has two tasks for each of the nine roles', () => {
    expect(tasks).toHaveLength(18);
    for (const role of ROLES) {
      expect(tasks.filter((t: { category: string }) => t.category === role)).toHaveLength(2);
    }
  });

  it.each(tasks.map((t) => [t.id, t]))('%s has no taskProblems', (_id, task) => {
    expect(taskProblems(task)).toEqual([]);
  });

  it.each(tasks.map((t) => [t.id, t]))('%s keeps its answer key out of the prompt', (_id, task) => {
    expect(task.prompt).not.toBe('');
    expect(task.expected).not.toBe('');
    // The loader's own rule covers the first 40 characters; this also checks the whole key is absent.
    expect(task.prompt).not.toContain(task.expected);
  });

  // The runner sends task.prompt and nothing else: no front matter, no title, no Expected heading.
  it.each(tasks.map((t) => [t.id, t]))('%s sends only its Prompt section to the model', (_id, task) => {
    expect(task.prompt).not.toMatch(/^(id|category|check|steps|tools|files|command|rubric):/m);
    expect(task.prompt).not.toContain(task.title);
    expect(task.prompt).not.toMatch(/^#{1,3} /m);
    expect(task.prompt).not.toMatch(/\bExpected\b/);
  });

  it('never tells the model about the answer-key folder', () => {
    for (const task of tasks) expect(task.prompt).not.toMatch(/answer-keys|\.solution\.mjs|checks\//);
  });

  // Prompts must not reveal whether the excerpt is faulty or a clean control.
  it.each(['reviewer-a', 'reviewer-b', 'security-a', 'security-b'])('%s does not reveal its verdict', (id) => {
    expect(byId(id).prompt).not.toMatch(/\bcontrol\b|should be approved|real (defect|issue)|planted|no security defect|\bclean\b|\bcorrect\b/i);
  });

  it('loads every task file with the loader', () => {
    for (const role of ROLES) {
      const file = join(PILOT, `${role}-a.md`);
      expect(loadTask(file).category).toBe(role);
    }
  });

  it('every template copy carries a squad.json with the node --test check', () => {
    for (const c of CASES) {
      const cfg = JSON.parse(readFileSync(join(TEMPLATES, c, 'tools', 'squad', 'squad.json'), 'utf8'));
      expect(cfg.commands.check).toBe('node --test');
    }
  });
});

describe('coder prompts', () => {
  const coders = ['coder-a', 'coder-b'];

  it.each(coders)('%s tells the agent to edit, run the check and finish', (id) => {
    const p = byId(id).prompt;
    expect(p).toMatch(/Edit the file/);
    expect(p).toMatch(/run the project check/);
    expect(p).toMatch(/call finish/);
  });

  // The old prompts asked for a code block only; that contradicted the edit-and-run flow.
  it.each(coders)('%s has no code-block-only or returned-module direction', (id) => {
    const p = byId(id).prompt;
    expect(p).not.toMatch(/code block and nothing else/);
    expect(p).not.toMatch(/Reply with the complete module/);
    expect(p).not.toMatch(/offline check/i);
  });

  it.each(coders)('%s is a rubric task, not a command task', (id) => {
    const t = byId(id);
    expect(t.check).toBe('rubric');
    expect(t.expected).toMatch(/Rubric/);
  });

  it('coder-b keeps the scope lexical and forbids file-system work', () => {
    expect(byId('coder-b').prompt).toMatch(/Scope is lexical/);
    expect(byId('coder-b').prompt).toMatch(/Do not touch the file system/);
  });
});

describe('controls and verifier verdicts', () => {
  it.each(['reviewer-b', 'security-b'])('%s is a json check that expects approve with no findings', (id) => {
    const t = byId(id);
    expect(t.check).toBe('json');
    expect(JSON.parse(blocks(t.expected, 'json')[0])).toEqual({ verdict: 'approve', findings: [] });
  });

  it('the clean security prompt states the lexical scope', () => {
    expect(byId('security-b').prompt).toMatch(/lexical/i);
    expect(byId('security-b').prompt).not.toMatch(/symlink|realpath|authoriz/i);
  });

  it('the faulty security prompt states the lexical path threat model', () => {
    const p = byId('security-a').prompt;
    expect(p).toMatch(/lexical/i);
    expect(p).toMatch(/root directory itself is allowed/);
    expect(p).not.toMatch(/authoriz/i);
  });

  it('the faulty reviewer stays a regex check with a changes verdict', () => {
    expect(byId('reviewer-a').check).toBe('regex');
    expect(byId('reviewer-a').expected).toContain('"verdict"\\s*:\\s*"changes"');
  });

  it('verifier-a rejects a false claim with failing evidence and no broad must-not', () => {
    const t = byId('verifier-a');
    expect(t.expected).toMatch(/REJECT/);
    expect(blocks(t.expected, 'must-not')).toEqual([]);
    expect(blocks(t.expected, 'regex').join('\n')).toMatch(/fail/);
  });

  it('verifier-b accepts the clean claim and cites passing evidence', () => {
    const t = byId('verifier-b');
    expect(t.expected).toMatch(/ACCEPT/);
    expect(blocks(t.expected, 'must-not')).toEqual([]);
    expect(blocks(t.expected, 'regex').join('\n')).toMatch(/pass/);
  });

  it('tester-b points at the clean fixture and expects the check to pass', () => {
    const t = byId('tester-b');
    expect(t.files).toEqual(['templates/case-b-clean/tests/guard.test.mjs']);
    expect(blocks(t.expected, 'regex').join('\n')).toMatch(/pass/);
  });
});

describe('case A: price formatter', () => {
  it('the original template FAILS its tests (planted bug)', () => {
    const r = runTests(materialize('case-a'));
    expect(r.status).not.toBe(0);
  });

  it('the reference solution PASSES its tests', () => {
    const r = runTests(materialize('case-a', 'case-a.solution.mjs'));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});

describe('case B: file path guard', () => {
  it('the original template FAILS its tests (sibling prefix bypass)', () => {
    const r = runTests(materialize('case-b'));
    expect(r.status).not.toBe(0);
  });

  it('the reference solution PASSES its tests', () => {
    const r = runTests(materialize('case-b', 'case-b.solution.mjs'));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('the clean template PASSES its tests without any solution file', () => {
    const r = runTests(materialize('case-b-clean'));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
