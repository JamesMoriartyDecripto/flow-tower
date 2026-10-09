import { readFileSync } from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildHooks } from './hooks';
import { docstoreServer } from './docstore';
import type { Classified } from './classify';

export type ClauseFamily = 'change_of_control' | 'assignment' | 'exclusivity' | 'termination' | 'indemnity';

export interface Cell {
  matterId: string;
  docId: string;
  column: string;
  answer: string;
  quote: string;
  location: string;
  reasoning: string;
  confidence: number;
}

const prompt = readFileSync(new URL('../prompts/clause-reviewer.md', import.meta.url), 'utf8');
const PROMPT_VERSION = 'v7'; // v8 runs in shadow on 100% of documents, results not shown to users

/** One isolated session per (document, clause family): no cross-document contamination. */
export async function extractDocument(matterId: string, doc: Classified, family: ClauseFamily): Promise<Cell[]> {
  const run = query({
    prompt: `Document ${doc.id} (${doc.doc_type}). Extract the ${family} columns.`,
    options: {
      model: 'claude-sonnet-5-5',
      systemPrompt: prompt.replace('{{clause_family}}', family),
      mcpServers: { docstore: docstoreServer(matterId) },
      allowedTools: ['mcp__docstore__read_pages', 'mcp__docstore__search_passages'],
      maxTurns: 12,
      hooks: buildHooks({ matterId, agent: `clause-reviewer:${family}`, promptVersion: PROMPT_VERSION }),
      settingSources: [],
    },
  });
  for await (const msg of run) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success') throw new Error(`${doc.id}/${family}: ${msg.subtype}`);
    const rows = JSON.parse(msg.result.match(/\[[\s\S]*\]/)![0]) as Omit<Cell, 'matterId' | 'docId'>[];
    return rows.map((r) => ({ ...r, matterId, docId: doc.id }));
  }
  return [];
}
