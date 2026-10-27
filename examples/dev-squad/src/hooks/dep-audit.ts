import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import type { HookCallback, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

const run = promisify(execFile);

interface NpmAuditVuln {
  severity: string;
  via: Array<{ title?: string }>;
}

interface NpmAuditReport {
  vulnerabilities: Record<string, NpmAuditVuln>;
}

/**
 * PostToolUse(Write|Edit). Runs npm audit when package.json or package-lock.json
 * is touched, blocking the turn if moderate+ advisories are introduced.
 * Zero-token, deterministic guard: uses npm's built-in advisory database.
 */
export const depAudit: HookCallback = async (input) => {
  const post = input as PostToolUseHookInput;
  const file = (post.tool_input as { file_path?: string }).file_path;
  if (!file || !/package(-lock)?\.json$/.test(basename(file))) return {};

  const opts = { cwd: post.cwd, timeout: 30_000 };
  let stdout = '';
  try {
    const r = await run('npm', ['audit', '--audit-level=moderate', '--json'], opts);
    stdout = r.stdout;
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities are found; stdout still holds the JSON report.
    stdout = String((err as { stdout?: string }).stdout ?? '');
  }

  let report: NpmAuditReport | undefined;
  try {
    report = JSON.parse(stdout) as NpmAuditReport;
  } catch {
    return {}; // npm crashed or produced no JSON: not the agent's problem
  }

  const vulns = Object.values(report.vulnerabilities ?? {});
  const blocking = vulns.filter((v) => ['moderate', 'high', 'critical'].includes(v.severity));
  if (!blocking.length) return {};

  const summary = blocking
    .map((v) => `${v.via?.[0]?.title ?? 'unknown'} (${v.severity})`)
    .slice(0, 10)
    .join('\n');

  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse' as const,
      additionalContext: `npm audit found ${blocking.length} advisory(s) after editing ${basename(file)}. Fix before continuing:\n${summary}`,
    },
  };
};
