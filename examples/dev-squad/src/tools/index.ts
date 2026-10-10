import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { fileFollowup } from './file-followup';
import { openPr } from './open-pr';
import { requestApproval } from './request-approval';
import { runCoder } from './run-coder';
import { runTests } from './run-tests';

/**
 * In-process MCP server, one per worktree: the tools run in the pipeline's process,
 * so they are bound to the issue worktree instead of reading process.cwd().
 * Tools are exposed to agents as mcp__squad__<name>, so agent files can grant
 * them one by one (least privilege):
 *   coder     -> mcp__squad__run_tests
 *   verifier  -> mcp__squad__run_tests
 *   lead      -> mcp__squad__run_coder, mcp__squad__request_approval, mcp__squad__file_followup
 *   pipeline  -> open_pr (called after the verifier, never by a subagent)
 */
export const squadServer = (cwd: string) => createSdkMcpServer({
  name: 'squad',
  version: '1.0.0',
  instructions: 'Dev Squad delivery tools. Prefer run_tests over raw test commands.',
  tools: [runTests(cwd), runCoder(cwd), openPr(cwd), requestApproval(cwd), fileFollowup(cwd)],
});
