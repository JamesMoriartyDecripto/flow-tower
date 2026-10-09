import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { requestApproval } from './request-approval';

// In-process "studio" MCP server shared by every agent. The other studio tools (save_draft,
// save_variant, generate_image, generate_video, canva_autofill, search_mentions, hide_comment,
// route_item, lookup_order, query_metrics) are thin wrappers registered the same way.
// There is deliberately no publish tool: only the publisher worker can post (src/hooks/publish-gate.ts).
export const studioServer = createSdkMcpServer({
  name: 'studio',
  version: '1.4.0',
  tools: [requestApproval],
});
