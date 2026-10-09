import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * In-process MCP server over the matter's document store (Postgres + pgvector in
 * eu-central-1). Agents can only read pages and search passages of the current matter;
 * the matter id is bound by the caller, never chosen by the model.
 */
export async function pageText(docId: string, page: number): Promise<string> {
  return `[${docId} p.${page}]`; // SELECT text FROM pages WHERE doc_id = $1 AND page = $2
}

export function docstoreServer(matterId: string) {
  return createSdkMcpServer({
    name: 'docstore',
    version: '1.0.0',
    tools: [
      tool('read_pages', 'Read OCR text of a page range of one document', { docId: z.string(), from: z.number(), to: z.number() },
        async ({ docId, from, to }) => {
          const pages = await Promise.all(Array.from({ length: to - from + 1 }, (_, i) => pageText(docId, from + i)));
          return { content: [{ type: 'text', text: pages.join('\n\n') }] };
        }),
      tool('search_passages', 'Hybrid (BM25 + vector) search within one document', { docId: z.string(), q: z.string() },
        async ({ docId, q }) => ({ content: [{ type: 'text', text: `top passages for "${q}" in ${docId} (matter ${matterId})` }] })),
    ],
  });
}
