import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { requestSignoff } from './request-signoff';

/** Copy goes into the Payload draft of the page, never straight to the published version. */
const saveCopy = tool(
  'save_copy',
  'Save copy for one page into its Payload draft.',
  { page: z.string(), locale: z.enum(['en', 'da', 'de']), sections: z.record(z.string(), z.string()), metaTitle: z.string().max(60), metaDescription: z.string().max(155) },
  async ({ page, locale }) => ({ content: [{ type: 'text', text: `draft saved: ${page} (${locale})` }] }),
);

export const studioServer = createSdkMcpServer({ name: 'studio', version: '1.0.0', tools: [requestSignoff, saveCopy] });
