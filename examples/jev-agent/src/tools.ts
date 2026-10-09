// Tool surface the LLM can propose. Execution happens only after risk-gate.ts says so.
import type Anthropic from '@anthropic-ai/sdk';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { logOutcome } from './judgments.ts';
import type { Verdict } from './risk-gate.ts';

const str = (description: string) => ({ type: 'string' as const, description });
const tool = (name: string, description: string, props: Record<string, object>): Anthropic.Tool => ({
  name, description, strict: true,
  input_schema: { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false },
});

export const TOOLS: Anthropic.Tool[] = [
  tool('Bash', 'Run a shell command in the workspace sandbox (no network except the allowlist).', { command: str('The command') }),
  tool('Read', 'Read a file in the workspace.', { path: str('Workspace-relative path') }),
  tool('Write', 'Create or overwrite a file in the workspace.', { path: str('Workspace-relative path'), content: str('Full file content') }),
  tool('Edit', 'Replace one exact string in a file.', { path: str('Path'), old: str('Exact text to replace'), new: str('Replacement') }),
  tool('Grep', 'Search the workspace with ripgrep.', { pattern: str('Regex') }),
  tool('browse', 'Hand a web subtask to the browser worker. Returns DONE or BLOCKED with a trace.', { url: str('Start URL'), goal: str('One-sentence goal') }),
];

export async function runTool(name: string, input: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  const s = (k: string) => String(input[k]);
  switch (name) {
    case 'Bash': {
      const r = spawnSync('bash', ['-lc', s('command')], { encoding: 'utf8', timeout: 120_000 });
      return { ok: r.status === 0, text: `${r.stdout}${r.stderr}`.slice(-20_000) };
    }
    case 'Read': return { ok: true, text: readFileSync(s('path'), 'utf8') };
    case 'Write': writeFileSync(s('path'), s('content')); return { ok: true, text: 'written' };
    case 'Edit': {
      const before = readFileSync(s('path'), 'utf8');
      if (!before.includes(s('old'))) return { ok: false, text: 'old string not found' };
      writeFileSync(s('path'), before.replace(s('old'), s('new')));
      return { ok: true, text: 'edited' };
    }
    case 'Grep': {
      const r = spawnSync('rg', ['-n', '--max-count', '50', s('pattern')], { encoding: 'utf8' });
      return { ok: true, text: r.stdout || 'no matches' };
    }
    default: return { ok: false, text: `unknown tool ${name}` };
  }
}

// Human review for held calls. 10 minutes, then the hold stands (reject).
// The answer is also the ground-truth label for calibrating the irreversible threshold.
export async function requestReview(call: Anthropic.ToolUseBlock, v: Verdict): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const timer = setTimeout(() => rl.close(), 10 * 60_000);
  const answer = await rl.question(`HOLD ${call.name} ${JSON.stringify(call.input)} (${v.reason}) approve? [y/N] `).catch(() => 'n');
  clearTimeout(timer);
  rl.close();
  const approved = answer.trim().toLowerCase() === 'y';
  logOutcome('tool_risk', approved ? 'approved' : 'declined', call.id);
  return approved;
}

export const gitStatus = () => execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).slice(0, 2000);
