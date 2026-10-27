import { describe, expect, it } from 'vitest';
import { formatAndLint, type Run } from '../examples/dev-squad/src/format-and-lint.ts';

type Call = { cmd: string; args: string[] };

// Fake runner: records every call and answers per tool name.
function fakeRun(answer: (tool: string) => Promise<unknown>) {
  const calls: Call[] = [];
  const run: Run = async (cmd, args) => {
    calls.push({ cmd, args });
    return answer(args.includes('eslint') ? 'eslint' : 'prettier');
  };
  return { run, calls };
}

const ok = async () => ({ stdout: '' });

describe('formatAndLint', () => {
  it('returns the ESLint problems when ESLint exits 1', async () => {
    const { run } = fakeRun(async (tool) => {
      if (tool === 'prettier') return ok();
      throw Object.assign(new Error('x'), {
        code: 1,
        stdout: '/w/a.ts\n  3:1  error  Unexpected var  no-var\n',
      });
    });
    const out = await formatAndLint('/w', '/w/a.ts', undefined, run);
    expect(out).toContain('Unexpected var');
  });

  it('returns empty when ESLint exits with a code other than 1', async () => {
    const { run } = fakeRun(async (tool) => {
      if (tool === 'prettier') return ok();
      throw Object.assign(new Error('x'), { code: 2, stdout: 'Oops! Something went wrong!' });
    });
    expect(await formatAndLint('/w', '/w/a.ts', undefined, run)).toBe('');
  });

  it('returns empty when both calls succeed', async () => {
    const { run } = fakeRun(ok);
    expect(await formatAndLint('/w', '/w/a.ts', undefined, run)).toBe('');
  });

  it('formats but does not lint a markdown file', async () => {
    const { run, calls } = fakeRun(ok);
    expect(await formatAndLint('/w', '/w/README.md', undefined, run)).toBe('');
    expect(calls.map((c) => c.args[1])).toEqual(['prettier']);
  });

  it('runs ESLint with --fix and --max-warnings=0 and no --format or --rule overrides', async () => {
    const { run, calls } = fakeRun(ok);
    await formatAndLint('/w', '/w/a.ts', undefined, run);
    const eslint = calls.find((c) => c.args.includes('eslint'));
    expect(eslint).toBeDefined();
    expect(eslint!.args).toContain('--fix');
    expect(eslint!.args).toContain('--max-warnings=0');
    expect(eslint!.args.some((a) => a.startsWith('--format'))).toBe(false);
    expect(eslint!.args).not.toContain('--rule');
  });

  it('keeps at most 15 problem lines', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `  ${i + 1}:1  error  Problem ${i + 1}  rule`);
    const { run } = fakeRun(async (tool) => {
      if (tool === 'prettier') return ok();
      throw Object.assign(new Error('x'), { code: 1, stdout: lines.join('\n') });
    });
    const out = await formatAndLint('/w', '/w/a.ts', undefined, run);
    expect(out.split('\n').length).toBeLessThanOrEqual(15);
  });

  it('passes an absolute path to prettier and eslint even for a dash-led argument', async () => {
    const { run, calls } = fakeRun(ok);
    await formatAndLint('/w', '--config=src/x.js', undefined, run);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.args.at(-1)).toBe('/w/--config=src/x.js');
      expect(c.args).not.toContain('--config=src/x.js');
    }
  });

  it('refuses a file that resolves outside cwd (../) without spawning any tool', async () => {
    const { run, calls } = fakeRun(ok);
    expect(await formatAndLint('/w', '../etc/x.ts', undefined, run)).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('refuses an absolute file outside cwd without spawning any tool', async () => {
    const { run, calls } = fakeRun(ok);
    expect(await formatAndLint('/w', '/etc/x.ts', undefined, run)).toBe('');
    expect(calls).toHaveLength(0);
  });
});
