import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { checkGates } from '../loop/quality-gates';

/**
 * PreToolUse guard on shipping. A packaged build for a store channel can only be
 * produced when:
 *   1. every release gate in config/quality-gates.yaml passes on the latest metrics, and
 *   2. a human answered the release_go_no_go checkpoint with "go".
 * Internal "dev" packages (for playtest bots) only need the build to compile.
 * Raw RunUAT / steamcmd calls through Bash are denied: use mcp__forge__package_build.
 */
const RELEASE_GATES = ['performance', 'playtest', 'bugs', 'art_signoff', 'code_review'];
const RAW_SHIP = /\b(RunUAT(\.bat|\.sh)?\s+BuildCookRun|steamcmd|run_app_build|butler push)\b/i;

interface ApprovalRecord { kind: string; approved: boolean; build_id?: string; at: string }

const deny = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse' as const,
    permissionDecision: 'deny' as const,
    permissionDecisionReason: `build-gate: ${reason}`,
  },
});

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

export function buildGate(ctx: { runId: string; cwd: string }): HookCallback {
  const state = join(ctx.cwd, '.forge', ctx.runId);

  return async (input) => {
    const { tool_name, tool_input } = input as PreToolUseHookInput;

    if (tool_name === 'Bash') {
      const cmd = String((tool_input as { command?: string }).command ?? '');
      return RAW_SHIP.test(cmd) ? deny('raw packaging/upload commands are denied. Call mcp__forge__package_build.') : {};
    }

    const { channel = 'dev', build_id } = tool_input as { channel?: 'dev' | 'playtest' | 'beta' | 'release'; build_id?: string };
    if (channel === 'dev' || channel === 'playtest') return {};

    const metrics = readJson<Record<string, number | string | boolean>>(join(state, 'metrics.json'));
    if (!metrics) return deny('no metrics.json for this run. Run QA and the perf profiler first.');

    const failing = Object.entries(checkGates(RELEASE_GATES, metrics)).filter(([, r]) => !r.pass);
    if (failing.length) {
      return deny(`quality gates failing: ${failing.map(([n, r]) => `${n} (${r.reasons.join(', ')})`).join('; ')}`);
    }

    const approvals = readJson<ApprovalRecord[]>(join(state, 'approvals.json')) ?? [];
    const go = approvals.find((a) => a.kind === 'release_go_no_go' && a.approved && (!build_id || a.build_id === build_id));
    if (!go) return deny(`no human "go" for build ${build_id ?? '(unspecified)'}. Request release_go_no_go approval first.`);

    return {};
  };
}
