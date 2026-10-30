import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real main.ts runs its `run` branch at import time, so each case sets argv, resets the module
// graph, and imports it fresh. deliver is mocked (the pipeline needs the SDK, absent on this host);
// gh is a fake execFile that answers the one `gh issue view` call fetchIssue makes.
const h = vi.hoisted(() => {
  const ghCalls: string[][] = [];
  const fakeExec = Object.assign(
    function execFile(): never { throw new Error('real execFile must not run in tests'); },
    {
      [Symbol.for('nodejs.util.promisify.custom')]: async (_file: string, args: string[]) => {
        ghCalls.push(args);
        const labels = [{ name: 'bug' }];
        return { stdout: JSON.stringify({ title: 'Fix typo', body: 'It says teh.', labels }), stderr: '' };
      },
    },
  );
  return { ghCalls, fakeExec, deliver: vi.fn() };
});

vi.mock('node:child_process', () => ({ execFile: h.fakeExec }));
vi.mock('../examples/dev-squad/src/pipeline.ts', () => ({ deliver: h.deliver }));

const mainPath = '../examples/dev-squad/src/main.ts';
const savedArgv = process.argv;
const savedExitCode = process.exitCode;

/** Imports the real entry point with the given CLI args and returns the exit code it set. */
async function runCli(args: string[]): Promise<number | undefined> {
  process.argv = ['node', 'main.ts', ...args];
  process.exitCode = undefined;
  vi.resetModules();
  await import(mainPath);
  // The run branch awaits deliver inside a top-level await, so the import resolving means it finished.
  return process.exitCode as number | undefined;
}

beforeEach(() => {
  h.ghCalls.length = 0;
  h.deliver.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = savedExitCode;
  vi.restoreAllMocks();
});

describe('sdk CLI exit status for `run`', () => {
  it('exits 0 when delivery reaches pr_open', async () => {
    h.deliver.mockResolvedValue('pr_open');
    expect(await runCli(['run', '--repo', 'acme/shop', '--issue', '412'])).toBeUndefined();
    expect(h.deliver).toHaveBeenCalledWith({ repo: 'acme/shop', number: 412, title: 'Fix typo', body: 'It says teh.', labels: ['bug'] });
    expect(h.ghCalls[0]).toEqual(['issue', 'view', '412', '-R', 'acme/shop', '--json', 'title,body,labels']);
  });

  it.each(['failed', 'over_budget', 'blocked', 'escalated', 'rejected', 'needs_info'])('exits 1 when delivery ends as %s', async (outcome) => {
    h.deliver.mockResolvedValue(outcome);
    expect(await runCli(['run', '--repo', 'acme/shop', '--issue', '412'])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(`[squad] #412 ended as ${outcome}, not pr_open`);
  });
});
