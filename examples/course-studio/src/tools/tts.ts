import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT } from '../config';

const API = 'https://api.elevenlabs.io/v1';

/** "Claude -> klohd" style lexicon from memory/pronunciations.md (markdown table rows). */
function lexicon(): Array<[RegExp, string]> {
  const md = readFileSync(join(ROOT, 'memory/pronunciations.md'), 'utf8');
  return [...md.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)]
    .filter(([, term]) => term !== 'Term' && !term.startsWith('-'))
    .map(([, term, say]) => [new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), say]);
}

/**
 * Text-to-speech for narration. Applies the course lexicon, caches by content hash so
 * re-renders after a caption fix cost nothing, and returns character-level timestamps
 * that the caption builder aligns to. The synthetic voice is disclosed in the course intro.
 */
export const synthesizeVoice = tool(
  'synthesize_voice',
  'Synthesize narration (SSML or plain text) to MP3 with timestamps. Uses the course voice and pronunciation lexicon. Cached by hash.',
  {
    out_dir: z.string(),
    segment_id: z.string().regex(/^m\d+-l\d+-s\d+$/),
    text: z.string().min(1).max(9000),
    voice_id: z.string().default(env.FORGE_VOICE_ID ?? 'course-narrator'),
    language: z.string().default('en'),
  },
  async ({ out_dir, segment_id, text, voice_id, language }) => {
    const spoken = lexicon().reduce((t, [re, say]) => t.replace(re, say), text);
    const hash = createHash('sha256').update(`${voice_id}:${language}:${spoken}`).digest('hex').slice(0, 12);
    const mp3 = join(out_dir, `${segment_id}.${hash}.mp3`);
    if (existsSync(mp3)) return ok(`cached ${mp3}`);

    const res = await fetch(`${API}/text-to-speech/${voice_id}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: spoken,
        model_id: 'eleven_multilingual_v2',
        language_code: language,
        voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0 },
      }),
    });
    if (!res.ok) return { content: [{ type: 'text' as const, text: `TTS failed: HTTP ${res.status}` }], isError: true };

    const { audio_base64, alignment } = (await res.json()) as { audio_base64: string; alignment: unknown };
    await mkdir(out_dir, { recursive: true });
    await writeFile(mp3, Buffer.from(audio_base64, 'base64'));
    await writeFile(mp3.replace(/\.mp3$/, '.alignment.json'), JSON.stringify(alignment));
    return ok(`wrote ${mp3} (+ alignment.json for captions), ${spoken.length} chars`);
  },
  { annotations: { idempotentHint: true, openWorldHint: true } },
);

const ok = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
