import { describe, expect, it } from 'vitest';
// The squad's modules are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { toolSchema } from '../tools/squad/tool-schema.mjs';

const RUN_NAMES = ['check', 'typecheck', 'test', 'diff', 'status', 'validate', 'dryrun'];
const build = (role: string, dirs = ['src', 'tests']) => toolSchema({ role, dirs, runNames: RUN_NAMES, base: 'origin/main' });
type Tool = { function: { name: string; description: string; parameters: { properties: Record<string, unknown>; required: string[] } } };
const names = (tools: Tool[]) => tools.map((t) => t.function.name);
const find = (tools: Tool[], name: string) => tools.find((t) => t.function.name === name) as Tool;

describe('tool schema by role', () => {
  it('a writing role is offered the three write tools, scoped to its folders', () => {
    const tools: Tool[] = build('coder', ['src', 'tests']);
    expect(names(tools)).toEqual(['list_files', 'read_file', 'grep', 'edit_file', 'write_file', 'delete_file', 'run', 'finish']);
    expect(find(tools, 'write_file').function.description).toBe('Create or overwrite a file (src/, tests/ only).');
    expect(find(tools, 'edit_file').function.parameters.required).toEqual(['path', 'old', 'new']);
  });

  it('a read-only role gets no write tools', () => {
    const tools: Tool[] = build('reviewer');
    expect(names(tools)).toEqual(['list_files', 'read_file', 'grep', 'run', 'finish']);
  });

  it('the run tool names only the commands it is given, and keeps the wording for each', () => {
    const tools: Tool[] = build('reviewer');
    const run = find(tools, 'run');
    expect(run.function.description).toBe(
      'Run a whitelisted command: check, typecheck, test, diff, status, validate, dryrun. test takes a file. diff is vs origin/main. dryrun (file: examples/<name>/scripts/<script>.mjs) runs it with --dry-run and no API key.',
    );
    expect(run.function.parameters.properties.command).toEqual({ type: 'string', enum: RUN_NAMES });
  });

  it('a dryrun the extras leave out is neither named nor advertised', () => {
    const tools: Tool[] = toolSchema({ role: 'reviewer', dirs: [], runNames: ['check', 'diff'], base: 'main' });
    const run = find(tools, 'run');
    expect(run.function.description).toBe('Run a whitelisted command: check, diff. diff is vs main.');
    expect(run.function.parameters.properties.command).toEqual({ type: 'string', enum: ['check', 'diff'] });
  });

  it('finish always requires its report', () => {
    expect(find(build('triage'), 'finish').function.parameters.required).toEqual(['report']);
  });
});
