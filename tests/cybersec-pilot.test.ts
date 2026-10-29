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

  it.each(pairs)('%s and %s are paired verdict fixtures', (a, b) => {
    const vulnerable = tasks.find((task) => task.id === a)!;
    const clean = tasks.find((task) => task.id === b)!;
    expect(vulnerable.expected).toContain('"verdict":"changes"');
    expect(JSON.parse(blocks(clean.expected, 'json')[0])).toEqual({ verdict: 'approve', findings: [] });
    expect(clean.prompt).not.toMatch(/should approve|expected verdict|clean version|safe version/i);
    expect(vulnerable.prompt).toMatch(/no tools/i);
  });
});
