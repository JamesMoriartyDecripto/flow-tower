import { readFileSync } from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ocrText } from './ingest';

export interface Classified {
  id: string;
  doc_type: string;
  parties: string[];
  governing_law: string | null;
  executed: boolean;
  privilege_flag: boolean;
  confidence: number;
}

const prompt = readFileSync(new URL('../prompts/classifier.md', import.meta.url), 'utf8');
const taxonomy = readFileSync(new URL('../config/taxonomy.yaml', import.meta.url), 'utf8');

/** Haiku, tool-less, two turns: cheap enough to run on every page-one of a 40k-document room. */
export async function classifyBatch(docIds: string[]): Promise<Classified[]> {
  const out: Classified[] = [];
  for (const id of docIds) {
    const head = await ocrText(id, { pages: 6 });
    const run = query({
      prompt: `${head.vdrPath}\n\n${head.text}`,
      options: {
        model: 'claude-haiku-5-5',
        systemPrompt: prompt.replace('{{taxonomy}}', taxonomy).replace('{{vdr_path}}', head.vdrPath),
        allowedTools: [],
        maxTurns: 2,
        settingSources: [],
      },
    });
    for await (const msg of run) {
      if (msg.type === 'result' && msg.subtype === 'success') {
        out.push({ id, ...JSON.parse(msg.result.match(/\{[\s\S]*\}/)![0]) });
      }
    }
  }
  return out;
}
