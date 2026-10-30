import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { childEnv } from '../child-env';

const run = promisify(execFile);

export interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: { name: string; assertionResults: { fullName: string; status: string; failureMessages: string[] }[] }[];
}

export type Exec = (file: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number }) => Promise<unknown>;

/**
 * Runs one test command and returns the JSON report it wrote, or null when none was written.
 * The stale report is removed first: a runner that crashes before writing would otherwise leave
 * the previous run's passing report behind, and the summary would report a green run that never happened.
 * The child gets the allowlisted environment, so the test code the coder just wrote cannot read host credentials.
 */
export async function runSuite(opts: {
  cwd: string;
  args: string[];
  reportFile: string;
  home: string;
  exec?: Exec;
}): Promise<VitestReport | null> {
  const exec: Exec = opts.exec ?? ((file, args, o) => run(file, args, o));
  await rm(opts.reportFile, { force: true });
  await exec('npx', ['--no-install', ...opts.args], {
    cwd: opts.cwd,
    env: childEnv(process.env, opts.home),
    timeout: 10 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  }).catch(() => undefined);
  return JSON.parse(await readFile(opts.reportFile, 'utf8').catch(() => 'null')) as VitestReport | null;
}
