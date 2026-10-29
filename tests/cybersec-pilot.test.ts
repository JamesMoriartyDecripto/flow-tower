import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blocks, loadTasks, taskProblems } from '../examples/model-benchmark/scripts/tasks.mjs';

const tasks = loadTasks(resolve('examples/model-benchmark/tasks/cybersec-pilot'));
const pairs = [['sql-a', 'sql-b'], ['shell-a', 'shell-b'], ['injection-a', 'injection-b'], ['credentials-a', 'credentials-b']];

describe('cybersecurity pilot fixtures', () => {
  it('loads exactly eight valid security JSON tasks', () => {
    expect(tasks).toHaveLength(8);
    for (const task of tasks) {
      expect(taskProblems(task)).toEqual([]);
      expect(task.category).toBe('security');
      expect(task.check).toBe('json');
      expect(task.steps).toBe(1);
      expect(task.prompt).not.toContain(task.expected);
      expect(task.prompt).not.toMatch(/\bExpected\b/);
    }
  });

  it('sends the threat model inside the prompt for every task', () => {
    // loadTask sends only the text below "## Prompt", so the threat model must live there.
    for (const task of tasks) {
      expect(task.prompt).toMatch(/threat model|scope/i);
      expect(task.prompt).toMatch(/Review only (the supplied|environment)/);
    }
  });

  it.each([
    ['sql-b', 'Scope SQL injection only'],
    ['shell-b', 'Scope shell injection only'],
    ['injection-b', 'Scope unauthorized external action and credential access only'],
    ['credentials-b', 'Scope env API key forwarding only'],
  ])('%s prompt carries its scope statement', (id, scope) => {
    expect(tasks.find((task) => task.id === id)!.prompt).toContain(scope);
  });

  it.each(pairs)('%s and %s are paired verdict fixtures', (a, b) => {
    const vulnerable = tasks.find((task) => task.id === a)!;
    const clean = tasks.find((task) => task.id === b)!;
    expect(vulnerable.expected).toContain('"verdict":"changes"');
    expect(JSON.parse(blocks(clean.expected, 'json')[0])).toEqual({ verdict: 'approve', findings: [] });
    expect(clean.prompt).not.toMatch(/should approve|expected verdict|clean version|safe version/i);
    expect(vulnerable.prompt).toMatch(/no tools/i);
  });
});
